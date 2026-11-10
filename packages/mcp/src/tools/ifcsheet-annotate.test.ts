/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet_annotate` (#707, step 6), end to end over the stdio transport on AC20-FZK-Haus: open the model, build the set,
 * annotate it, and check that the dimensions, tags and level marks are on the right views, that a second call adds none, that
 * undo takes the annotation back, and that the DXFs it prints are the command line's `build --annotate` ones.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
// The command line, where the engine's package says its binary is.
const ENGINE = new URL('../../../ifcsheet/', import.meta.url);
const CLI = fileURLToPath(new URL((JSON.parse(readFileSync(new URL('package.json', ENGINE), 'utf8')) as { bin: { ifcsheet: string } }).bin.ifcsheet, ENGINE));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(CLI) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet_annotate tests: ${missing}; run \`pnpm fixtures\` and build the packages`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[]; tools?: any[] }; error?: unknown };
const cli = (...args: string[]) => promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });

describe.skipIf(missing !== null)('ifcsheet_annotate over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  let modelId: string;
  const waiting = new Map<number, (r: Reply) => void>();

  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  const tool = async (name: string, args: Record<string, unknown>) => (await call('tools/call', { name, arguments: args })).result!;
  /** A tool call that must succeed. */
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await tool(name, args);
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };
  /** A tool call that must be refused, with `message` in the reason. */
  const refused = async (name: string, args: Record<string, unknown>, message: string | RegExp) => {
    const r = await tool(name, args);
    expect(r.isError, `${name} ${JSON.stringify(args)} should be refused`).toBe(true);
    const reason = `${r.structuredContent?.message ?? r.content?.[0]?.text ?? ''} ${JSON.stringify(r.structuredContent?.details ?? {})}`;
    expect(reason).toMatch(message instanceof RegExp ? message : new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return r.structuredContent;
  };
  const generate = async () => (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-annotate-')));
    stdin = new PassThrough();
    const stdout = new PassThrough();
    let buffer = '';
    stdout.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
        const msg = JSON.parse(buffer.slice(0, nl)) as Reply & { id: number };
        buffer = buffer.slice(nl + 1);
        waiting.get(msg.id)?.(msg);
        waiting.delete(msg.id);
      }
    });
    transport = new StdioTransport({ stdin, stdout, stderr: new PassThrough() });
    await transport.connect(createMCPServer({ version: '0.0.0-test', config: { allowedPaths: [dirname(FZK), tmp] } }));
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-annotate-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  /** What a call drafted, by kind of view: the shape types added over its views. */
  const kinds = (result: any, kind: string): string[] => result.views.filter((v: any) => v.kind === kind).flatMap((v: any) => Object.keys(v.added));
  const total = (result: any, kind: string, shape: string): number => result.views.filter((v: any) => v.kind === kind).reduce((n: number, v: any) => n + (v.added[shape] ?? 0), 0);

  it('advertises the tool with its commands and a precise description', async () => {
    const tool = (await call('tools/list')).result!.tools!.find((t) => t.name === 'ifcsheet_annotate');
    expect(tool.description).toMatch(/Annotate the set/);
    expect(tool.inputSchema.required).toEqual(['document_id']);
    expect(tool.inputSchema.properties.commands.items.enum).toEqual(['dimension', 'tag', 'level']);
    expect(tool.inputSchema.additionalProperties).toBe(false);
  });

  it('puts dimensions and tags on the plans and level marks on the elevations and sections, and a second call adds none', async () => {
    const document_id = await generate();
    const first = await ok('ifcsheet_annotate', { document_id });
    expect(first.added).toBeGreaterThan(0);
    expect(new Set(first.views.map((v: any) => v.kind))).toEqual(new Set(['plan', 'elevation', 'section']));
    expect(first.views.every((v: any) => !v.left_out)).toBe(true);
    expect(total(first, 'plan', 'dimension')).toBeGreaterThan(0);
    expect(kinds(first, 'plan').some((k) => k !== 'dimension')).toBe(true);
    expect(kinds(first, 'plan')).not.toContain('level');
    expect(total(first, 'elevation', 'level') + total(first, 'section', 'level')).toBeGreaterThan(0);
    expect([...kinds(first, 'elevation'), ...kinds(first, 'section')]).not.toContain('dimension');
    expect(first.added).toBe(first.views.reduce((n: number, v: any) => n + v.commands.reduce((m: number, c: any) => m + c.added, 0), 0));
    // A command that adds nothing says why, as a key.
    for (const c of first.views.flatMap((v: any) => v.commands).filter((c: any) => c.outcome === 'skipped')) expect(c.messages[0].key).toMatch(/^(drafting|wall)\./);

    const again = await ok('ifcsheet_annotate', { document_id });
    expect(again.added).toBe(0);
    expect(again.views.flatMap((v: any) => v.commands).every((c: any) => c.outcome !== 'added')).toBe(true);
  }, 300_000);

  it('annotates only the commands and views chosen, and undo takes the annotation back', async () => {
    const document_id = await generate();
    const plan = (await ok('ifcsheet_list_sheets', { document_id })).sheets[0].views[0].view;
    const dry = await ok('ifcsheet_annotate', { document_id, commands: ['dimension'], views: [plan], dry_run: true });
    expect(dry).toMatchObject({ dry_run: true });
    expect(dry.views.map((v: any) => v.name)).toEqual([plan]);
    expect(kinds(dry, 'plan')).toEqual(['dimension']);
    expect((await ok('ifcsheet_undo', { document_id })).changed).toBe(false);

    const real = await ok('ifcsheet_annotate', { document_id, commands: ['dimension'], views: [plan] });
    expect(real.added).toBe(dry.added);
    expect(real.views[0].commands.map((c: any) => c.command)).toEqual(['dimall']);
    const redone = await ok('ifcsheet_annotate', { document_id, commands: ['dimension'], views: [plan] });
    expect(redone.added).toBe(0);
    expect((await ok('ifcsheet_undo', { document_id })).changed).toBe(true);
    expect((await ok('ifcsheet_annotate', { document_id, commands: ['dimension'], views: [plan] })).added).toBe(real.added);
  }, 300_000);

  it('prints the annotation: the DXFs are the command line\'s `build --annotate=dimension,level` ones', async () => {
    const document_id = await generate();
    await ok('ifcsheet_annotate', { document_id, commands: ['dimension', 'level'] });
    const toolOut = join(tmp, 'tool-annotated');
    await ok('ifcsheet_export_dxf', { document_id, directory: toolOut });
    const plainOut = join(tmp, 'tool-plain');
    await ok('ifcsheet_export_dxf', { document_id: await generate(), directory: plainOut });
    const cliOut = join(tmp, 'cli-annotated');
    await cli('build', FZK, '--out', join(cliOut, 'set.pdf'), '--dxf', join(cliOut, 'dxf'), '--annotate=dimension,level');
    const files = (await readdir(toolOut)).sort();
    expect(files).toEqual((await readdir(join(cliOut, 'dxf'))).sort());
    const size = async (dir: string) => (await Promise.all((await readdir(dir)).map((f) => readFile(join(dir, f), 'utf8')))).join('').length;
    expect(await size(toolOut)).toBeGreaterThan((await size(plainOut)) + 2000);
    for (const f of files) expect(await readFile(join(toolOut, f), 'utf8')).toBe(await readFile(join(cliOut, 'dxf', f), 'utf8'));
  }, 600_000);

  it('refuses what it cannot do', async () => {
    const document_id = await generate();
    await refused('ifcsheet_annotate', { document_id, commands: ['frobnicate'] }, /Expected one of .*dimension.*tag.*level/);
    await refused('ifcsheet_annotate', { document_id, preset: 'Doors only' }, /preset of the project \(it has none\)/);
    await refused('ifcsheet_annotate', { document_id, commands: ['tag'], preset: 'x' }, /commands or a preset, not both/);
    await refused('ifcsheet_annotate', { document_id, tag_parts: ['stairs'] }, /Expected one of .*doors.*windows.*rooms/);
    await refused('ifcsheet_annotate', { document_id, views: ['No such view'] }, /view/i);
    await refused('ifcsheet_annotate', { document_id: 'sheetset-999' }, /No drawing set/);
  }, 120_000);
});
