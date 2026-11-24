/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `drawingSetFromIfc` on AC20-FZK-Haus: one call gives the set `ifcsheet build` writes. The DXFs are compared file by file
 * with the command line's, so the library entry and the command cannot drift; the PDF and the SVGs are written from the
 * same sheets. What it refuses, it refuses in words before the model is opened.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { DrawingSetRefusal, drawingSetFromIfc } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the drawingSetFromIfc test: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'drawing-set-from-ifc-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The DXFs `ifcsheet build` writes with `extra`, by file name. */
async function commandLineDxfs(name: string, ...extra: string[]): Promise<Map<string, string>> {
  const out = join(dir, name);
  const err: string[] = [];
  const code = await run(['build', FZK, '--out', join(out, 'set.pdf'), '--dxf', out, ...extra], { stdout: () => undefined, stderr: (t) => void err.push(t) });
  expect(code, err.join('')).toBe(EXIT.ok);
  return new Map(readdirSync(out).filter((f) => f.endsWith('.dxf')).sort().map((f) => [f, readFileSync(join(out, f), 'latin1')]));
}

const text = (data: Uint8Array): string => Buffer.from(data).toString('latin1');

describe.skipIf(missing !== null)('drawingSetFromIfc on AC20-FZK-Haus', () => {
  const bytes = () => new Uint8Array(readFileSync(FZK));

  it('gives the sheets the command line writes, as PDF, DXF and SVG', async () => {
    const set = await drawingSetFromIfc(bytes());
    const cli = await commandLineDxfs('plain');
    const dxf = set.dxf();
    expect(dxf.map((f) => f.fileName).sort()).toEqual([...cli.keys()]);
    for (const file of dxf) expect(text(file.data), file.fileName).toBe(cli.get(file.fileName));
    expect(set.sheets.length).toBeGreaterThanOrEqual(3);
    expect(set.annotated).toEqual([]);
    expect(Buffer.from((await set.pdf()).subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    const svg = set.svg();
    expect(svg.map((f) => f.sheet)).toEqual(set.sheets.map((s) => s.number));
    for (const file of svg) expect(file.data.startsWith('<?xml'), file.fileName).toBe(true);
    // The document is plain data: a program can keep it as JSON.
    expect(JSON.parse(JSON.stringify(set.document)).sheets.length).toBe(set.sheets.length);
  }, 300_000);

  it('annotates, names and applies a standard as the command line does', async () => {
    const set = await drawingSetFromIfc(bytes().buffer, { annotate: true, name: 'House Alpha', standard: 'de', language: 'ro' });
    const cli = await commandLineDxfs('full', '--annotate', '--name', 'House Alpha', '--standard', 'de', '--locale', 'ro');
    for (const file of set.dxf()) expect(text(file.data), file.fileName).toBe(cli.get(file.fileName));
    expect(set.name).toBe('House Alpha');
    expect(set.annotated.reduce((n, v) => n + Object.values(v.added).reduce((a, b) => a + b, 0), 0)).toBeGreaterThan(20);
    const plain = await drawingSetFromIfc(bytes());
    expect(set.sheets.flatMap((s) => s.texts).length).toBeGreaterThan(plain.sheets.flatMap((s) => s.texts).length + 20);
  }, 300_000);

  it('refuses in words what it cannot do, before opening the model', async () => {
    const empty = new Uint8Array();
    await expect(drawingSetFromIfc(empty, { standard: 'xx' })).rejects.toThrow(DrawingSetRefusal);
    await expect(drawingSetFromIfc(empty, { standard: 'xx' })).rejects.toThrow(/"xx" is not one of .*ro/);
    await expect(drawingSetFromIfc(empty, { annotate: 'dimensions please' })).rejects.toThrow(/annotate: .*dimension, tag, level/);
    await expect(drawingSetFromIfc(empty, { language: 'fr' as 'en' })).rejects.toThrow(/"fr" is not one of en, ro/);
  });
});
