/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The DXF as a CAD working file (#831), on AC20-FZK-Haus: `--dxf-layers element` puts each element class on its own AIA-style layer, walls split
 * by IsExternal, and `--dxf-units model` writes each view at its true size in metres: a plan at the IFC's own x and y, every view as it
 * reads on the paper, never mirrored. Without them the files are today's.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dxfEntities, dxfLayerExtent, dxfLayers } from './__fixtures__/dxf-text.js';
import { EXIT, run } from './cli.js';
import { openModel } from './model.js';

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

  // #831: a model-unit plan was mirrored about X, written at (x, -y): the paper's y-down was taken back through the cut's signs.
  it('in model units the ground floor plan is at the IFC\'s own x and y, not mirrored (#831)', async () => {
    const opened = await openModel(new Uint8Array(readFileSync(FZK)));
    // What the ground floor plan cuts (a metre above its floor), in IFC axes: the meshes are Y up, their Z is minus the IFC's Y.
    const cut = (ifcType: RegExp) => opened.buildingMeshes.filter((m) => ifcType.test(m.ifcType ?? '')).map((m) => {
      const [ox, oy, oz] = m.origin ?? [0, 0, 0];
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i] + ox, y = -(m.positions[i + 2] + oz), z = m.positions[i + 1] + oy;
        b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
      }
      return { id: m.expressId, ...b };
    }).filter((b) => b.z0 < 1 && b.z1 > 1);
    const walls = cut(/^IfcWall/);
    expect(walls.length).toBeGreaterThan(0);
    const plan = model.get('A-101.dxf') ?? '';
    const e = dxfLayerExtent(plan, 'A-WALL-EXTR')!;
    // The outer walls span the IFC's x 0..12 and y 0..10; mirrored, y read -10..0.
    expect(e.x0).toBeCloseTo(Math.min(...walls.map((w) => w.x0)), 2);
    expect(e.x1).toBeCloseTo(Math.max(...walls.map((w) => w.x1)), 2);
    expect(e.y0).toBeCloseTo(Math.min(...walls.map((w) => w.y0)), 2);
    expect(e.y1).toBeCloseTo(Math.max(...walls.map((w) => w.y1)), 2);
    // Every ground floor door has its symbol drawn at it: the reporter's door, on the wall at y = -4.5, was written at y = +4.5.
    const symbols = dxfEntities(plan).filter((s) => s.layer === 'A-DOOR-SYMB').flatMap((s) => s.points);
    const doors = new Map(cut(/^IfcDoor/).map((d) => [d.id, d]));
    expect(doors.size).toBeGreaterThan(2);
    for (const d of doors.values()) {
      const c = { x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2 };
      const nearest = Math.min(...symbols.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
      expect(nearest, `door #${d.id} at ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).toBeLessThan(0.75);
    }
  }, 120_000);

  // The ground floor plan, the north and south elevations, the east and west elevations (mirrored too before #831: their first axis runs
  // backwards on the paper) and the section.
  it.each(['A-101.dxf', 'A-201.dxf', 'A-202.dxf', 'A-301.dxf'])('in model units %s reads as it does on the paper, only scaled, not mirrored (#831)', (name) => {
    // The same element linework in both files, in the same order: on the paper (mm, y up) and in the model (m). Each run's every step
    // is the paper's step divided by the viewport's mm per metre, x and y alike: a mirror turns one of them round.
    const pick = (text: string) => dxfEntities(text).filter((s) => (s.type === 'LWPOLYLINE' || s.type === 'LINE') && s.layer.startsWith('A-') && !s.layer.startsWith('A-ANNO'));
    const onPaper = pick(element.get(name) ?? ''), inModel = pick(model.get(name) ?? '');
    expect(inModel.length).toBe(onPaper.length);
    let compared = 0;
    onPaper.forEach((p, i) => {
      const m = inModel[i].points;
      expect(m.length, `#${i}`).toBe(p.points.length);
      let k = 0;
      for (let j = 1; j < m.length; j++) {
        const pd = { x: p.points[j].x - p.points[j - 1].x, y: p.points[j].y - p.points[j - 1].y };
        const md = { x: m[j].x - m[j - 1].x, y: m[j].y - m[j - 1].y };
        if (Math.hypot(pd.x, pd.y) < 1) continue;
        k ||= Math.hypot(md.x, md.y) / Math.hypot(pd.x, pd.y);
        expect(md.x, `#${i} step ${j} x`).toBeCloseTo(pd.x * k, 3);
        expect(md.y, `#${i} step ${j} y`).toBeCloseTo(pd.y * k, 3);
        compared++;
      }
    });
    expect(compared).toBeGreaterThan(20);
  });

  it('in model units an elevation stands on its real heights: the ground at 0, the walls up to their tops (#831)', () => {
    // North and south elevations: the outer walls stand from the ground floor (0) to the eaves the IFC gives them; never upside down.
    const e = dxfLayerExtent(model.get('A-201.dxf') ?? '', 'A-WALL-EXTR')!;
    expect(e.y0).toBeCloseTo(0, 2);
    expect(e.y1).toBeGreaterThan(2.5);
  });

  it('a model-unit file leaves out the sheet\'s frame and title block', () => {
    const layers = layersOf(model);
    for (const name of ['FRAME', 'TITLEBLOCK', 'VIEWPORT-LABELS']) expect(layers.has(name), name).toBe(false);
  });
});
