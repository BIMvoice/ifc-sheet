/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hosted Streamable HTTP endpoint (#165), as a Web `Request` -> `Response`
 * function a serverless platform can serve at `/mcp`.
 *
 * Off by default: it answers 404 unless `IFCSHEET_HOSTED_MCP=1`. Stateless: a
 * POST builds a fresh server, answers the JSON-RPC message (or batch) in the
 * body as plain JSON, and drops the server, so nothing outlives the request
 * (a batch shares one server, so `ifcsheet_open_model` then a tool taking its
 * `model_id` work inside one batch). Only the `ifcsheet_*` tools are served,
 * with no resources or prompts (both are session state), and with file paths
 * refused (`ServerConfig.hosted`): the model comes in the request.
 */

import { JsonRpcErrorCode, PROTOCOL_VERSION, type JsonRpcMessage } from '../protocol/index.js';
import { errorResponse, isJsonRpcRequest } from '../protocol/jsonrpc.js';
import { PromptRegistry } from '../prompts/index.js';
import { ResourceRegistry } from '../resources/index.js';
import { MCPServer } from '../server.js';
import { ToolRegistry } from '../tools/types.js';
import { ifcsheetTools } from '../tools/ifcsheet.js';
import { fullScope } from '../auth/scope.js';

export const HOSTED_ENV = 'IFCSHEET_HOSTED_MCP';
/** Largest model a call may carry, bytes (decoded). */
export const DEFAULT_MAX_MODEL_BYTES = 25 * 1024 * 1024;
/** Wall time of one request, milliseconds. */
export const DEFAULT_MAX_MS = 50_000;

export interface HostedOptions {
  env?: Record<string, string | undefined>;
  version?: string;
  maxModelBytes?: number;
  maxMs?: number;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

function buildServer(opts: Required<Pick<HostedOptions, 'maxModelBytes'>> & { version: string }): MCPServer {
  const tools = new ToolRegistry();
  tools.registerAll(ifcsheetTools);
  return new MCPServer({
    name: 'ifcsheet-hosted',
    version: opts.version,
    tools,
    resources: new ResourceRegistry(),
    prompts: new PromptRegistry(),
    scope: fullScope(),
    capabilities: { tools: { listChanged: false } },
    config: { readOnly: false, samplingEnabled: false, hosted: true, maxModelBytes: opts.maxModelBytes },
  });
}

async function readBody(req: Request, cap: number): Promise<string | 'too-large'> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) return 'too-large';
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Serves one hosted MCP request. */
export async function handleHostedMcp(req: Request, options: HostedOptions = {}): Promise<Response> {
  const env = options.env ?? process.env;
  if (env[HOSTED_ENV] !== '1') return new Response('Not Found', { status: 404 });

  if (req.method !== 'POST') {
    // No server-initiated stream and no session to end: stateless mode.
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  const maxModelBytes = options.maxModelBytes ?? DEFAULT_MAX_MODEL_BYTES;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  // base64 grows a model by a third; the rest is the JSON around it.
  const bodyCap = Math.ceil(maxModelBytes * 4 / 3) + 64 * 1024;

  const raw = await readBody(req, bodyCap);
  if (raw === 'too-large') {
    return reply(413, errorResponse(null, JsonRpcErrorCode.InvalidRequest, `The request is larger than the limit of ${bodyCap.toLocaleString()} bytes (a model of at most ${maxModelBytes.toLocaleString()} bytes).`));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reply(400, errorResponse(null, JsonRpcErrorCode.ParseError, 'The body is not JSON.'));
  }
  const batch = Array.isArray(parsed);
  const messages = (batch ? parsed : [parsed]) as JsonRpcMessage[];
  if (messages.length === 0) return reply(400, errorResponse(null, JsonRpcErrorCode.InvalidRequest, 'An empty batch.'));

  const server = buildServer({ maxModelBytes, version: options.version ?? '0.0.0' });
  const timeoutMessage = `The request took longer than ${Math.round(maxMs / 1000)} s and was stopped.`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The server of a stateless request has no earlier `initialize` to rely on.
    await server.handleMessage({ jsonrpc: '2.0', id: '__hosted_init', method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'hosted', version: '0' } } });
    const work = Promise.all(messages.map((m) => server.handleMessage(m)));
    const deadline = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), maxMs); });
    const done = await Promise.race([work, deadline]);
    if (done === 'timeout') {
      const ids = messages.filter(isJsonRpcRequest).map((m) => m.id);
      const errors = ids.map((id) => errorResponse(id, JsonRpcErrorCode.InternalError, timeoutMessage));
      return reply(504, batch ? errors : errors[0] ?? errorResponse(null, JsonRpcErrorCode.InternalError, timeoutMessage));
    }
    const responses = done.filter((r) => r !== null);
    if (responses.length === 0) return new Response(null, { status: 202 });
    return reply(200, batch ? responses : responses[0]);
  } finally {
    if (timer) clearTimeout(timer);
    server.detach();
  }
}
