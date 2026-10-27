/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sessions of the hosted endpoint, held by the client. The server keeps
 * nothing between requests (serverless instances do not share memory, so a
 * session in memory would be lost on the next cold or other instance). Instead
 * every tool result carries a `session_token`: the project (the sets and
 * their schedules, gzip, base64url) and a reference to each model (its name
 * and SHA-256), signed with HMAC-SHA-256 under `IFCSHEET_HOSTED_MCP_SECRET`
 * and valid for an hour. The client sends it back as `session_token` on the
 * next call, together with `ifc_base64` for a tool that needs the model (a
 * model is too big to round-trip; the server checks the bytes against the
 * hash in the token). The token holds no path and grants no file access; the
 * file-path refusal of hosted mode applies to every call in a session.
 * Nothing of a token or a model is logged.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { DefaultSet } from '@bimvoice/ifcsheet';
import type { ToolContext } from '../context.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { CallToolResult } from '../protocol/index.js';
import { hasSheetModel, restoreSheetModel, restoreSheetSet, storeContents, type SetSchedule, type SheetModelEntry } from '../tools/ifcsheet-store.js';
import { hostedModelCache, sha256Hex } from '../tools/hosted-model-cache.js';
import type { Tool } from '../tools/types.js';

export const SECRET_ENV = 'IFCSHEET_HOSTED_MCP_SECRET';
/** A secret shorter than this is treated as not set. */
export const MIN_SECRET_CHARS = 32;
/** How long a token is accepted after it was issued. */
export const TOKEN_TTL_MS = 60 * 60 * 1000;
/** Largest token, characters. The request cap leaves room for it (`hosted.ts`). */
export const MAX_TOKEN_CHARS = 1024 * 1024;
/** Models a session names; the oldest goes first, with its sets (as in a stdio session). */
export const MAX_SESSION_MODELS = 8;
/** Largest document a verified token may unpack to, bytes. */
const MAX_UNPACKED = 32 * 1024 * 1024;
const PREFIX = 'ifs1';

interface ModelRef { id: string; name: string; sha256: string; size: number }
interface SetRef { id: string; modelId: string; set: DefaultSet; schedules: SetSchedule[] }
export interface SessionState { exp: number; nextModel: number; nextSet: number; models: ModelRef[]; sets: SetRef[] }

const fail = (message: string, code: string = ToolErrorCode.INVALID_INPUT): never => {
  throw new ToolExecutionError({ code: code as never, message });
};

const sign = (secret: string, body: string): Buffer => createHmac('sha256', secret).update(`${PREFIX}.${body}`).digest();

export function issueToken(state: SessionState, secret: string): string {
  const body = gzipSync(Buffer.from(JSON.stringify(state))).toString('base64url');
  return `${PREFIX}.${body}.${sign(secret, body).toString('base64url')}`;
}

/** The state a token carries, or a ToolExecutionError saying why it is refused. The signature is checked before anything is unpacked. */
export function verifyToken(token: string, secret: string, now: number): SessionState {
  const again = ' Open the model again with ifcsheet_open_model or ifcsheet_generate_set to start a new session.';
  const parts = token.length <= MAX_TOKEN_CHARS ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== PREFIX) return fail(`session_token is not a token of this server.${again}`);
  const given = Buffer.from(parts[2], 'base64url');
  const expected = sign(secret, parts[1]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail(`session_token is not valid (it was changed, or signed by another deployment).${again}`);
  let state: SessionState;
  try {
    state = JSON.parse(gunzipSync(Buffer.from(parts[1], 'base64url'), { maxOutputLength: MAX_UNPACKED }).toString('utf8')) as SessionState;
  } catch {
    return fail(`session_token cannot be read.${again}`);
  }
  if (typeof state.exp !== 'number' || now > state.exp) return fail(`session_token has expired (a session lasts ${TOKEN_TTL_MS / 60000} minutes from its last call).${again}`);
  return state;
}

export interface SessionOptions { secret: string; now?: () => number }

/** One request's view of its session: the token the request started with (shared by every call in a batch) and the state it began from. */
class RequestSession {
  token: string | undefined;
  base: SessionState = { exp: 0, nextModel: 1, nextSet: 1, models: [], sets: [] };
  constructor(readonly opts: Required<SessionOptions>) {}

  open(token: string): void {
    if (this.token === token) return;
    if (this.token !== undefined) fail('One request can carry one session: every call in a batch must send the same session_token.');
    this.base = verifyToken(token, this.opts.secret, this.opts.now());
    this.token = token;
  }

  /** Puts back the model (and its sets) a call names by `model_id` or `document_id`, from the bytes the call carries. */
  async restore(input: Record<string, unknown>, ctx: ToolContext): Promise<void> {
    const docId = typeof input.document_id === 'string' ? input.document_id : undefined;
    const modelId = typeof input.model_id === 'string' ? input.model_id : docId ? this.base.sets.find((s) => s.id === docId)?.modelId : undefined;
    const ref = this.base.models.find((m) => m.id === modelId);
    if (!ref || hasSheetModel(ctx, ref.id)) return;
    const base64 = input.ifc_base64;
    if (typeof base64 !== 'string') {
      return fail(`Model ${ref.id} ('${ref.name}') of this session is not held by the server: send the same file again as ifc_base64 together with session_token.`);
    }
    const cap = ctx.config.maxModelBytes;
    if (cap !== undefined && Math.floor(base64.length * 3 / 4) > cap) return fail(`The model is larger than the ${cap.toLocaleString()} byte limit of this server.`);
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    if (sha256Hex(bytes) !== ref.sha256) return fail(`The ifc_base64 sent is not the file of model ${ref.id} ('${ref.name}'): its content differs from the one this session opened.`);
    const { openModel } = await import('@bimvoice/ifcsheet/headless');
    let model;
    try {
      // Parsed again only when this instance has not parsed these bytes already.
      model = (await hostedModelCache.open(bytes, openModel)).model;
    } catch (err) {
      return fail(`Failed to open '${ref.name}': ${(err as Error).message}`, ToolErrorCode.PARSE_FAILED);
    }
    const entry: SheetModelEntry = { id: ref.id, name: ref.name, model, bytes, contentHash: ref.sha256 };
    restoreSheetModel(ctx, entry, this.base);
    for (const s of this.base.sets) if (s.modelId === ref.id) restoreSheetSet(ctx, s.id, entry, s.set, s.schedules);
  }

  /** The state after a call: what the token began with, with the entries the store holds now put over it. */
  next(ctx: ToolContext): SessionState {
    const live = storeContents(ctx);
    const models = [...this.base.models];
    for (const m of live.models) {
      const ref: ModelRef = { id: m.id, name: m.name, sha256: m.contentHash ?? sha256Hex(m.bytes), size: m.bytes.byteLength };
      const at = models.findIndex((x) => x.id === m.id);
      if (at >= 0) models[at] = ref; else models.push(ref);
    }
    let sets = [...this.base.sets];
    for (const s of live.sets) {
      const ref: SetRef = { id: s.id, modelId: s.modelId, set: s.set, schedules: s.schedules };
      const at = sets.findIndex((x) => x.id === s.id);
      if (at >= 0) sets[at] = ref; else sets.push(ref);
    }
    while (models.length > MAX_SESSION_MODELS) {
      const gone = models.shift()!;
      sets = sets.filter((s) => s.modelId !== gone.id);
    }
    return { exp: this.opts.now() + TOKEN_TTL_MS, nextModel: Math.max(this.base.nextModel, live.nextModel), nextSet: Math.max(this.base.nextSet, live.nextSet), models, sets };
  }
}

const SESSION_TOKEN_PROP = { type: 'string', description: 'The session_token a previous result returned (valid for an hour): the project built so far. Without it the call starts a new session.' } as const;
const IFC_PROP = { type: 'string', description: 'The .ifc file\'s bytes, base64: send the same file the session opened, so the server can draw from it again (it checks the content against the session). Needed with session_token by any tool that takes a document_id or model_id.' } as const;

/** The tools, each taking `session_token` and handing back a fresh one. Without a secret (of at least MIN_SECRET_CHARS) the tools come back unchanged: the endpoint stays stateless. */
export function withSessions(tools: Tool[], options: { secret?: string; now?: () => number } | undefined): Tool[] {
  const secret = options?.secret;
  if (!secret || secret.length < MIN_SECRET_CHARS) return tools;
  const session = new RequestSession({ secret, now: options?.now ?? Date.now });
  return tools.map((tool) => {
    const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    const schema = { ...tool.inputSchema, properties: { ...props, session_token: SESSION_TOKEN_PROP, ...('ifc_base64' in props ? {} : { ifc_base64: IFC_PROP }) } };
    return {
      ...tool,
      description: `${tool.description} On the hosted endpoint, pass session_token from the previous result to continue the same project; the result carries a new one.`,
      inputSchema: schema as Tool['inputSchema'],
      async handler(input, ctx): Promise<CallToolResult> {
        const { session_token: token, ...rest } = input;
        if (token !== undefined) {
          if (typeof token !== 'string') return fail('session_token must be a string: the one a previous result returned.');
          session.open(token);
        }
        const names = typeof rest.model_id === 'string' || typeof rest.document_id === 'string';
        if (names && session.token !== undefined) await session.restore(rest, ctx);
        // With a model_id or document_id the bytes only restore the model; the tool itself takes a handle.
        const { ifc_base64: _bytes, ...handleOnly } = rest;
        const result = await tool.handler(names ? handleOnly : rest, ctx);
        if (result.isError) return result;
        const issued = issueToken(session.next(ctx), secret);
        if (issued.length > MAX_TOKEN_CHARS) return fail(`The session grew past the ${MAX_TOKEN_CHARS.toLocaleString()} character limit of a token; this call's change was not kept.`);
        const content = result.content.map((c, i) => (i === 0 && c.type === 'text' ? { ...c, text: `${c.text} Pass session_token (in structuredContent) to the next call to continue this project.` } : c));
        return { ...result, content, structuredContent: { ...result.structuredContent, session_token: issued, session_expires_at: new Date(session.opts.now() + TOKEN_TTL_MS).toISOString() } };
      },
    } satisfies Tool;
  });
}
