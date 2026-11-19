/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The DXF as a CAD working file (#831), on AC20-FZK-Haus: `--dxf-layers element` puts each element class on its own AIA-style layer, walls split
 * by IsExternal, and `--dxf-units model` writes each view at its true size in metres. Without them the files are today's.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dxfLayerExtent, dxfLayers } from './__fixtures__/dxf-text.js';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** The DXFs `build --dxf` writes with these options, by file name. */
async function build(...extra: string[]): Promise<Map<string, string>> {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-dxf831-'));
  dirs.push(dir);
  const code = await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--dxf', join(dir, 'dxf'), ...extra], { stdout: () => undefined, stderr: () => undefined });
  expect(code).toBe(EXIT.ok);
  return new Map(readdirSync(join(dir, 'dxf')).map((f) => [f, readFileSync(join(dir, 'dxf', f), 'latin1')]));
}

describe.skipIf(missing !== null)('ifcsheet build --dxf-layers / --dxf-units, on AC20-FZK-Haus', () => {
  let paper: Map<string, string>;
  let element: Map<string, string>;
  let model: Map<string, string>;
  let explicit: Map<string, string>;
  beforeAll(async () => {
    paper = await build();
    explicit = await build('--dxf-layers', 'pen', '--dxf-units', 'paper');
    element = await build('--dxf-layers', 'element');
    model = await build('--dxf-layers', 'element', '--dxf-units', 'model');
  }, 600_000);

  const layersOf = (files: Map<string, string>) => new Set([...files.values()].flatMap((t) => dxfLayers(t)));

  it('by default the layers are the pens (CUT, SEEN, ...), as before', () => {
    const layers = layersOf(paper);
    expect(layers.has('CUT')).toBe(true);
    expect([...layers].some((l) => l.startsWith('A-WALL'))).toBe(false);
  });

  it('naming the defaults writes the same files as naming nothing', () => {
    expect([...explicit.keys()]).toEqual([...paper.keys()]);
    for (const [name, text] of paper) expect(explicit.get(name) === text, name).toBe(true);
  });

  it('by element, the cut walls are on A-WALL-EXTR and A-WALL-INTR, the openings and dimensions on their layers', () => {
    const layers = layersOf(element);
    for (const name of ['A-WALL-EXTR', 'A-WALL-INTR', 'A-GLAZ']) expect(layers.has(name), name).toBe(true);
    expect(layers.has('CUT')).toBe(false);
  });

  it('in model units the plan\'s external walls read their real size in metres', () => {
    // The IFC gives Wand-Ext-ERDG-1 a 10.0 m by 0.3 m bounding box: the ground floor plan's outer walls span 10 m by 12 m, where the paper at 1:50 has them 200 mm by 240 mm.
    const e = dxfLayerExtent(model.get('A-101.dxf') ?? '', 'A-WALL-EXTR');
    expect(e).toBeDefined();
    expect(e!.y1 - e!.y0).toBeCloseTo(10, 1);
    expect(e!.x1 - e!.x0).toBeCloseTo(12, 1);
    expect(model.get('A-101.dxf')).toMatch(/\$INSUNITS\s+70\s+6\b/);
    expect(paper.get('A-101.dxf')).toMatch(/\$INSUNITS\s+70\s+4\b/);
  });

  it('a model-unit file leaves out the sheet\'s frame and title block', () => {
    const layers = layersOf(model);
    for (const name of ['FRAME', 'TITLEBLOCK', 'VIEWPORT-LABELS']) expect(layers.has(name), name).toBe(false);
  });
});
