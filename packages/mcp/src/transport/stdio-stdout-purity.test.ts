/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Over stdio, stdout carries JSON-RPC and nothing else. The geometry engine
 * logs through `console.log` ("[IFC-LITE] Opening classifier: ..."); a client
 * that parses stdout strictly breaks on that line. This drives the real server
 * process on AC20-FZK-Haus (open, generate a set, export the PDF) and checks
 * every stdout line is a JSON-RPC message and the engine's text is on stderr.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(CLI) ? 'the server is not built: run `pnpm --filter @ifc-lite/mcp build`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[mcp] skipping the stdio stdout purity test: ${missing}`);

type Reply = { id?: number; result?: { isError?: boolean; structuredContent?: Record<string, unknown> } };

/** Run the server process through the calls; resolve with everything it wrote. */
async function drive(): Promise<{ stdout: string; stderr: string; replies: Reply[] }> {
  const child = spawn(process.execPath, [CLI], { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
  child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
  const replies = (): Reply[] => stdout.split('\n').flatMap((l) => { try { return [JSON.parse(l) as Reply]; } catch { return []; } });
  const reply = async (id: number): Promise<Reply> => {
    for (let i = 0; i < 1200; i++) {
      const r = replies().find((x) => x.id === id);
      if (r) return r;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error(`no reply to ${id}\nstderr: ${stderr.slice(-500)}`);
  };
  const send = (msg: object): void => { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`); };
  const call = async (id: number, name: string, args: object): Promise<Reply> => {
    send({ id, method: 'tools/call', params: { name, arguments: args } });
    const r = await reply(id);
    expect(r.result?.isError, `${name}: ${JSON.stringify(r)}`).toBeFalsy();
    return r;
  };
  try {
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'purity-test', version: '1' } } });
    await reply(1);
    send({ method: 'notifications/initialized' });
    const opened = await call(2, 'ifcsheet_open_model', { file_path: FZK });
    const set = await call(3, 'ifcsheet_generate_set', { model_id: opened.result?.structuredContent?.model_id });
    await call(4, 'ifcsheet_export_pdf', { document_id: set.result?.structuredContent?.document_id });
  } finally {
    child.stdin.end();
    child.kill();
  }
  return { stdout, stderr, replies: replies() };
}

describe.skipIf(missing)('stdio stdout carries only JSON-RPC', () => {
  it('writes every engine log line to stderr, none to stdout', async () => {
    const { stdout, stderr, replies } = await drive();
    const lines = stdout.split('\n').filter((l) => l !== '');
    const stray = lines.filter((l) => {
      try { return (JSON.parse(l) as { jsonrpc?: string }).jsonrpc !== '2.0'; } catch { return true; }
    });
    expect(stray).toEqual([]);
    expect(replies.map((r) => r.id)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(stderr).toContain('[IFC-LITE] Opening');
  }, 120_000);
});
