/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DIMALL on a plan of two models (#829): an architecture model and a structure model loaded together, the structure's
 * walls standing in the architecture's and its columns along every wall, the drawing carrying the lines of both (a tiled
 * floor in every room) and the symbols the view puts over them. On the BIMcollab ARC + STR pair, "Fix DIMALL" held the
 * app's main thread for 8.6 s: every place a room's figure was tried was tested against every line and symbol of the
 * drawing. The lines and symbols must cost about what the bare plan costs, on whatever machine runs the test.
 */

import { describe, expect, it } from 'vitest';
import type { Pt } from '../draft-types.js';
import { styleBookOf } from '../style-fit.js';
import { BoxGrid } from './box-grid.js';
import { planDimAll, type DimAllInputs } from './dimall.js';
import { tableMeasure } from './measure.js';
import { rectangle, surveyParts } from './model-fixture.js';
import { MAX_TRIES, planRoomChains } from './rooms.js';
import type { PlanPart } from './types.js';

/** The federation's id offset of the second model, as the viewer gives it. */
const SECOND = 1_000_000;
const CELL = 6;
const T = 0.2;

function walls(nx: number, ny: number, first: number): PlanPart[] {
  const [W, H] = [nx * CELL, ny * CELL];
  const openings = (id: number) => [{ id, at: 1, width: 0.9, kind: 'door' as const }, { id: id + 1, at: 3.5, width: 1.2, kind: 'window' as const }];
  const out = surveyParts(rectangle(W, H, T, openings(first + 1000), openings(first + 1002), first));
  let id = first + 10;
  for (let i = 1; i < nx; i++) out.push(...surveyParts([{ id: id++, start: { x: i * CELL, y: T }, degrees: 90, length: H - 2 * T, thickness: T }]));
  for (let j = 1; j < ny; j++) out.push(...surveyParts([{ id: id++, start: { x: T, y: j * CELL }, degrees: 0, length: W - 2 * T, thickness: T }]));
  return out;
}

const square = (x: number, y: number, r: number): Pt[] => [{ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r }];

/** The plan of the two models: `nx` by `ny` rooms of 6 m, `tiles` floor lines each way in every room, `symbols` small boxes over the drawing. */
function twoModels(nx: number, ny: number, tiles: number, symbols: number): DimAllInputs {
  const [W, H] = [nx * CELL, ny * CELL];
  const parts = [...walls(nx, ny, 100), ...walls(nx, ny, SECOND + 100)];
  let id = SECOND + 50_000;
  for (let i = 0; i <= nx; i++) for (let y = 0; y <= H; y += 1.5) parts.push({ id: id++, kind: 'filler', rings: [square(i * CELL, y, 0.15)] });
  for (let j = 0; j <= ny; j++) for (let x = 0; x <= W; x += 1.5) parts.push({ id: id++, kind: 'filler', rings: [square(x, j * CELL, 0.15)] });
  const rooms: DimAllInputs['rooms'][number][] = [];
  const lines: { a: Pt; b: Pt }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const [x0, y0, x1, y1] = [i * CELL + T, j * CELL + T, (i + 1) * CELL - T, (j + 1) * CELL - T];
      rooms.push({ guid: `room-${i}-${j}`, ring: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
      for (let k = 0; k < tiles; k++) {
        const [x, y] = [x0 + ((x1 - x0) * (k + 0.5)) / tiles, y0 + ((y1 - y0) * (k + 0.5)) / tiles];
        lines.push({ a: { x: x0, y }, b: { x: x1, y } }, { a: { x, y: y0 }, b: { x, y: y1 } });
      }
    }
  }
  const obstacles = Array.from({ length: symbols }, (_, k) => {
    const [x, y] = [(k * 7.31) % W, (k * 3.17) % H];
    return { x0: x, y0: y, x1: x + 0.05, y1: y + 0.05 };
  });
  let n = 0;
  return {
    viewId: 'plan', layerId: 'layer', placed: [], parts, rooms, obstacles, lines, newId: () => `d${++n}`, book: styleBookOf(undefined, undefined),
    paperUnit: 0.1, firstMm: undefined, settings: { textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard' }, reader: { sectionLink: () => null, measure: tableMeasure }, rectsOf: () => [],
  };
}

describe('DIMALL on a plan of two models (#829)', () => {
  it('draws the strings and the rooms of a plan carrying 28,800 lines and 12,000 symbols in about the time of the bare plan', () => {
    const time = (inputs: DimAllInputs) => {
      const started = performance.now();
      const result = planDimAll(inputs);
      return { took: performance.now() - started, result };
    };
    // The same plan without its lines and symbols: what the walls and rooms cost on this machine, at its load.
    const bare = time({ ...twoModels(8, 6, 0, 0), lines: [], obstacles: [] });
    const full = time(twoModels(8, 6, 300, 12_000));
    // Before #829 the lines and symbols multiplied the work: 11.4 s against 0.2 s bare on a laptop. After: 0.45 s.
    console.log(`[#829] bare plan ${bare.took.toFixed(0)} ms, with lines and symbols ${full.took.toFixed(0)} ms`);
    expect(full.took).toBeLessThan(10 * bare.took + 1000);
    const dims = full.result.add.map((d) => d.shape.type);
    expect(dims.length).toBeGreaterThan(48);
    expect(new Set(dims)).toEqual(new Set(['dimension']));
  }, 120_000);

  it('a hall whose figure fits nowhere is left out after a bounded number of places, and says so', () => {
    // 120 m by 6 m, a tile line every 10 cm each way: every place the figure is tried crosses one.
    const [L, D] = [120, 6];
    const parts = surveyParts(rectangle(L, D, T));
    const lines: { a: Pt; b: Pt }[] = [];
    for (let x = T + 0.05; x < L - T; x += 0.1) lines.push({ a: { x, y: T }, b: { x, y: D - T } });
    for (let y = T + 0.05; y < D - T; y += 0.1) lines.push({ a: { x: T, y }, b: { x: L - T, y } });
    const ring = [{ x: T, y: T }, { x: L - T, y: T }, { x: L - T, y: D - T }, { x: T, y: D - T }];
    const plan = planRoomChains(parts, [{ id: 'hall', ring }], { textHeight: 0.25, measure: tableMeasure, obstacles: [], lines });
    expect(plan.chains).toEqual([]);
    expect(plan.dropped).toBe(2);
    // The long way has more places than the budget: it stops there and is counted as such.
    expect(plan.outOfTries).toBeGreaterThanOrEqual(1);
    expect(MAX_TRIES).toBeGreaterThan(0);
  }, 60_000);
});

describe('BoxGrid (#829)', () => {
  it('answers what a scan of every box answers, for boxes small, large and far apart', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const boxOf = (size: number) => {
      const [x, y] = [rnd() * 400 - 200, rnd() * 400 - 200];
      return { x0: x, y0: y, x1: x + rnd() * size, y1: y + rnd() * size };
    };
    const boxes = [...Array.from({ length: 500 }, () => boxOf(2)), ...Array.from({ length: 20 }, () => boxOf(300))];
    const grid = new BoxGrid<(typeof boxes)[number]>(1);
    for (const b of boxes) grid.add(b, b);
    const meets = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
    for (let k = 0; k < 300; k++) {
      const q = boxOf(k % 10 === 0 ? 500 : 3);
      expect(grid.some(q, (b) => meets(b, q))).toBe(boxes.some((b) => meets(b, q)));
      expect([...grid.near(q)].filter((b) => meets(b, q)).length).toBe(boxes.filter((b) => meets(b, q)).length);
    }
  });
});
