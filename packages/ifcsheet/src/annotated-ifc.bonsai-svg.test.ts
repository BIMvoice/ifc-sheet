/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #548: the SVG of each Bonsai drawing and of the sheet layout is written at the Location the IfcDocumentReference names. The
 * files are checked against the references in the exported STEP; where a Python with `ifcopenshell` is on the machine,
 * `test-support/check-bonsai.py` reads the IFC the way Bonsai does and opens every referenced file as SVG.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAnnotatedIfc, type AnnotatedIfcInput, type AnnotatedIfcResult } from './annotated-ifc.js';
import { exportSvg } from './svg-export.js';
import type { SheetGraphic } from './sheet-graphic.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../test-support/check-bonsai.py', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
const GROUND = '2eyxpyOx95m90jmsXLOuR0';
const ROOF = '273g3wqLzDtfYIl7qqkgcO';

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3', 'python'].filter((p): p is string => !!p)) {
    try { execFileSync(py, ['-c', 'import ifcopenshell.validate'], { stdio: 'ignore' }); return py; } catch { /* not this one */ }
  }
  return null;
}
const python = findPython();

/** A sheet with two viewports, each drawn with one wall outline, a cut fill and a text. */
const sheet: SheetGraphic = {
  sheetId: 's1', number: 'A01', name: 'Plans & more', paper: { w: 420, h: 297 },
  frame: [[{ x: 10, y: 10 }, { x: 410, y: 10 }, { x: 410, y: 287 }, { x: 10, y: 287 }, { x: 10, y: 10 }]],
  fills: [], cut: [], lines: [], symbols: { strokes: [], solids: [] }, marks: [], images: [], underlays: [],
  pens: [{ layer: 'CUT', stroke: '#000000', width: 0.5, fill: null, runs: [[{ x: 30, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 90 }]], regions: [] },
    { layer: 'CUT', stroke: null, width: 0, fill: '#888888', runs: [], regions: [[[{ x: 30, y: 40 }, { x: 90, y: 40 }, { x: 90, y: 90 }, { x: 30, y: 40 }]]] }],
  texts: [{ at: { x: 40, y: 100 }, text: 'Ground <floor>', size: 3.5 }, { at: { x: 240, y: 100 }, text: 'Roof floor', size: 3.5 }],
  viewports: [{ viewId: 'v-ground', box: { x: 20, y: 20, w: 180, h: 200 } }, { viewId: 'v-roof', box: { x: 220, y: 20, w: 180, h: 200 } }],
};

describe('exportSvg', () => {
  it('writes the sheet whole, and a viewport as its own box without the frame or the other view\'s text', () => {
    const whole = exportSvg(sheet);
    expect(whole).toContain('viewBox="0 0 420 297"');
    expect(whole).toContain('Ground &lt;floor&gt;');
    expect(whole).toContain('Roof floor');
    const one = exportSvg(sheet, { viewId: 'v-roof' });
    expect(one).toContain('viewBox="220 20 180 200"');
    expect(one).toContain('Roof floor');
    expect(one).not.toContain('Ground');
    expect(one).not.toContain('410,287');
    expect(() => exportSvg(sheet, { viewId: 'nope' })).toThrow(/no viewport nope/);
  });
});

describe.skipIf(missing !== null)('AC20-FZK-Haus exported with the SVGs of its drawings and sheet (#548)', () => {
  const source = new Uint8Array(readFileSync(FZK));
  const view = (id: string, name: string, storey: string) => ({
    viewId: id, name, scale: 100, storeyGlobalIds: [storey], svg: exportSvg(sheet, { viewId: id }),
    curves: [{ type: 'polyline' as const, points: [{ x: 2, y: 3 }, { x: 3, y: 4 }] }], texts: [],
  });
  const input = (skipSvg = false): AnnotatedIfcInput => ({
    source,
    views: [view('v-ground', 'Ground floor', GROUND), skipSvg ? { ...view('v-roof', 'Roof floor', ROOF), svg: undefined } : view('v-roof', 'Roof floor', ROOF)],
    sheets: [{ name: 'Plans', identification: 'A01', viewIds: ['v-ground', 'v-roof'], svg: exportSvg(sheet) }],
  });

  /** The Locations the exported STEP's DRAWING and LAYOUT references name. */
  const locationsIn = (r: AnnotatedIfcResult): string[] =>
    [...new Set([...new TextDecoder().decode(r.bytes).matchAll(/IFCDOCUMENTREFERENCE\('((?:drawings|layouts)\/[^']+\.svg)',[^;]*?'(?:DRAWING|LAYOUT)'/g)].map((m) => m[1]))].sort();

  it('returns one file for every Location a DRAWING or LAYOUT reference names', async () => {
    const r = await buildAnnotatedIfc(input());
    expect(locationsIn(r)).toEqual(['drawings/Ground floor.svg', 'drawings/Roof floor.svg', 'layouts/A01 - Plans.svg']);
    expect(r.files.map((f) => f.path).sort()).toEqual(locationsIn(r));
    expect(r.files.find((f) => f.path === 'drawings/Roof floor.svg')?.text).toContain('viewBox="220 20 180 200"');
  });

  it('a view given no SVG leaves its Location without a file', async () => {
    const r = await buildAnnotatedIfc(input(true));
    expect(locationsIn(r)).toContain('drawings/Roof floor.svg');
    expect(r.files.map((f) => f.path)).not.toContain('drawings/Roof floor.svg');
  });

  it.skipIf(!python)('every reference Bonsai reads points to a file that parses as SVG', async () => {
    const check = async (skipSvg: boolean): Promise<string[]> => {
      const r = await buildAnnotatedIfc(input(skipSvg));
      const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-svg-'));
      writeFileSync(join(dir, 'fzk.ifc'), r.bytes);
      for (const f of r.files) { mkdirSync(dirname(join(dir, f.path)), { recursive: true }); writeFileSync(join(dir, f.path), f.text); }
      const highest = Math.max(...[...new TextDecoder().decode(source).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
      const seen = JSON.parse(execFileSync(python as string, [SCRIPT, join(dir, 'fzk.ifc'), String(highest), dir], { encoding: 'utf8', maxBuffer: 1 << 26 })) as { new_findings: string[]; svg_problems: string[] };
      expect(seen.new_findings).toEqual([]);
      return seen.svg_problems;
    };
    expect(await check(false)).toEqual([]);
    expect(await check(true)).toEqual(['drawings/Roof floor.svg: no such file']);
  }, 120_000);
});
