/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM (Norway) readiness check over MCP (#372): `ifcsheet_check_readiness` on AC20-FZK-Haus returns exactly the
 * findings `ifcsheet check --json` returns, with `ids: "byggesaksbim"` or a project that opted in, and none of them otherwise.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticByggesaksbimModel } from '@bimvoice/ifcsheet/byggesaksbim';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const BIN = fileURLToPath(new URL('../../../ifcsheet/dist/bin.js', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(BIN) ? 'ifcsheet not built' : null;
if (missing) console.warn(`[mcp] skipping the ByggesaksBIM tool tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any }; error?: unknown };
type Finding = { kind: string; missing: string; effect: string; params: Record<string, unknown> };

/** What `ifcsheet check <FZK> --json [args]` prints; the command exits 1 when it has findings. */
async function cli(...args: string[]): Promise<Finding[]> {
  const out = await promisify(execFile)(process.execPath, [BIN, 'check', FZK, '--json', ...args]).catch((e: { stdout: string }) => e);
  // The wasm loader prints its own "[IFC-LITE]" lines on stdout before the report.
  return (JSON.parse(out.stdout.slice(out.stdout.indexOf('{\n'))) as { findings: Finding[] }).findings;
}

describe.skipIf(missing !== null)('ifcsheet_check_readiness, ByggesaksBIM, over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  const waiting = new Map<number, (r: Reply) => void>();
  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  const tool = async (name: string, args: Record<string, unknown>) => (await call('tools/call', { name, arguments: args })).result!;

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-no-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-test', version: '0' } });
  });

  afterAll(async () => {
    transport.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const project = (byggesaksbim: boolean) => JSON.stringify({ format: 'ifclite-project', version: 1, name: 'P', views: [], sheets: [], byggesaksbim });
  const norway = (findings: Finding[]) => findings.filter((f) => f.kind.startsWith('byggesaksbim'));
  const open = async () => (await tool('ifcsheet_open_model', { file_path: FZK })).structuredContent.model_id as string;

  it('returns the findings the CLI returns: H1, H4 and H5 fail, by the argument and by the project, in the same order and words', async () => {
    const model_id = await open();
    const flag = await tool('ifcsheet_check_readiness', { model_id, ids: 'byggesaksbim' });
    expect(flag.isError, JSON.stringify(flag)).toBeFalsy();
    expect(norway(flag.structuredContent.findings).map((f) => f.kind)).toEqual(['byggesaksbimH1', 'byggesaksbimH4', 'byggesaksbimH5']);
    expect(flag.structuredContent.findings).toEqual(await cli('--ids', 'byggesaksbim'));

    const file = join(tmp, 'opted-in.ifclite-project.json');
    await writeFile(file, project(true));
    const byPath = await tool('ifcsheet_check_readiness', { model_id, project_path: file });
    expect(byPath.structuredContent.findings).toEqual(flag.structuredContent.findings);
    expect(byPath.structuredContent.findings).toEqual(await cli('--project', file));
    const inline = await tool('ifcsheet_check_readiness', { model_id, project_json: project(true) });
    expect(inline.structuredContent.findings).toEqual(flag.structuredContent.findings);
  }, 180_000);

  it('refuses an IFC2X3 model with one finding, the finding the CLI gives', async () => {
    const old = join(tmp, 'old.ifc');
    await writeFile(old, syntheticByggesaksbimModel({ schema: 'IFC2X3', without: ['bra'] }));
    const model_id = (await tool('ifcsheet_open_model', { file_path: old })).structuredContent.model_id as string;
    const r = await tool('ifcsheet_check_readiness', { model_id, ids: 'byggesaksbim' });
    expect(norway(r.structuredContent.findings).map((f) => [f.kind, f.missing])).toEqual([['byggesaksbimSchema', 'ByggesaksBIM requires IFC4; this model is IFC2X3 and was not checked.']]);
  }, 180_000);

  it('returns none when the project did not opt in, or there is no project, and refuses an unknown set', async () => {
    const model_id = await open();
    const out = await tool('ifcsheet_check_readiness', { model_id, project_json: project(false) });
    const alone = await tool('ifcsheet_check_readiness', { model_id });
    for (const r of [out, alone]) {
      expect(norway(r.structuredContent.findings)).toEqual([]);
      expect(r.structuredContent.findings.map((f: Finding) => f.kind)).toEqual(['noMaterials']);
    }
    const bad = await tool('ifcsheet_check_readiness', { model_id, ids: 'other' });
    expect(bad.isError).toBe(true);
  }, 180_000);
});
