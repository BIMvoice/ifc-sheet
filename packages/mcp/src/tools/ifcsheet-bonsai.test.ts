/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #548 over MCP: `ifcsheet_issue_set` with `annotated_ifc` on AC20-FZK-Haus writes the set's plan views and sheets into the copy as
 * Bonsai drawings and sheets, and the SVG each IfcDocumentReference names at its Location next to the IFC. Where a Python with
 * `ifcopenshell` is on the machine, `check-bonsai.py` reads the output the way Bonsai does and opens every referenced file as SVG.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const ENGINE = fileURLToPath(new URL('../../../ifcsheet/dist/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../../ifcsheet/test-support/check-bonsai.py', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(ENGINE) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3', 'python'].filter((p): p is string => !!p)) {
    try { execFileSync(py, ['-c', 'import ifcopenshell.validate'], { stdio: 'ignore' }); return py; } catch { /* not this one */ }
  }
  return null;
}
const python = findPython();

interface Reply { result?: { isError?: boolean; structuredContent?: any; content?: { text?: string }[] } }

describe.skipIf(missing !== null)('the annotated IFC of ifcsheet_issue_set carries the Bonsai drawings and their SVG (#548)', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  const waiting = new Map<number, (r: Reply) => void>();
  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => { waiting.set(id, resolve); stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  };
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = (await call('tools/call', { name, arguments: args })).result!;
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-bonsai-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-bonsai-test', version: '0' } });
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('lists the drawings and sheets in the IFC, writes every file they name, and Bonsai\'s reader finds nothing wrong', async () => {
    const modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
    const id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
    const out = join(tmp, 'issue');
    const r = await ok('ifcsheet_issue_set', { document_id: id, directory: out, annotated_ifc: true });
    const report = r.annotated_ifc;
    expect(report.drawings).toBeGreaterThan(0);
    expect(report.sheets).toBeGreaterThan(0);
    expect(report.svg_files.length).toBe(report.drawings + report.sheets);

    const ifcPath = join(out, 'AC20-FZK-Haus.annotated.ifc');
    const ifc = readFileSync(ifcPath, 'utf8');
    const locations = [...ifc.matchAll(/IFCDOCUMENTREFERENCE\('((?:drawings|layouts)\/[^']+\.svg)',[^;]*?'(?:DRAWING|LAYOUT)'/g)].map((m) => m[1]);
    expect(new Set(locations)).toEqual(new Set(report.svg_files));
    for (const path of report.svg_files as string[]) {
      expect(existsSync(join(out, path)), path).toBe(true);
      const svg = readFileSync(join(out, path), 'utf8');
      expect(svg.includes('<svg ') && svg.trimEnd().endsWith('</svg>'), path).toBe(true);
    }
    expect(r.files.filter((f: { kind: string }) => f.kind === 'annotated_svg')).toHaveLength(report.svg_files.length);

    if (python) {
      const highest = Math.max(...[...readFileSync(FZK, 'utf8').matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
      const seen = JSON.parse(execFileSync(python, [SCRIPT, ifcPath, String(highest), out], { encoding: 'utf8', maxBuffer: 1 << 26 })) as { new_findings: string[]; svg_problems: string[] };
      expect(seen.new_findings).toEqual([]);
      expect(seen.svg_problems).toEqual([]);
    }
  }, 180_000);
});
