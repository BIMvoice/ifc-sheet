/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan symbol drawn in IfcSheet (#448) is a block like an imported one: the drafts make its strokes, a project file keeps it, and the
 * engine's one plan-symbol path (`openingSymbols`, what the headless build calls through `planOpeningSymbols`) draws it on the opening,
 * mirrored for a right-hand type. An entry saved before drawing existed draws as it always did.
 */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { defaultDoorSpec, defaultWindowSpec, type JoineryViewDraft, type JoinerySpec } from '@ifc-lite/create';
import { blockAsShapes, blockFromDrafts, DRAWN_SYMBOL_NAME, isDrawnSymbol, symbolCanvas } from './joinery-drawn-symbol.js';
import { withPlanBlock } from './joinery-block-symbol.js';
import { readJoineryList } from './joinery-spec-read.js';
import { openingSymbols } from './opening-symbols.js';

const draft = (id: string, shape: JoineryViewDraft['shape'], lineType?: JoineryViewDraft['lineType']): JoineryViewDraft => ({ id, shape, ...(lineType ? { lineType } : {}) });
/** A left-hand door as the drafting tools make it: the leaf (a closed rectangle), its swing (an arc), a dashed line and a circle. */
const DRAFTS: JoineryViewDraft[] = [
  draft('leaf', { type: 'polyline', pts: [{ x: -0.45, y: 0 }, { x: -0.40, y: 0 }, { x: -0.40, y: -0.9 }, { x: -0.45, y: -0.9 }], closed: true }),
  draft('swing', { type: 'arc', c: { x: -0.45, y: 0 }, r: 0.9, start: -Math.PI / 2, end: 0 }),
  draft('line', { type: 'line', a: { x: -0.45, y: 0 }, b: { x: 0.45, y: 0 } }, 'dashed'),
];

const door = (operation: 'swing-left' | 'swing-right', withBlock = true): JoinerySpec => {
  const spec = { ...defaultDoorSpec(), id: 'd1', width: 0.9, panels: [{ col: 0, row: 0, operation }] };
  return withBlock ? { ...spec, planBlock: blockFromDrafts(DRAFTS)! } : spec;
};

/** A 0.9 m door in a 0.2 m wall, upright, at x 5; the plan is cut at 1.2 m. */
const mesh = (): MeshData => {
  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [0, 2.1]) for (const z of [-0.1, 0.1]) pts.push(x, y, z);
  return { expressId: 7, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 0, 2], localToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
};
const symbolOf = (spec: JoinerySpec) => openingSymbols([mesh()], { axis: 'y', position: 1.2, flipped: false }, () => 0, () => ({ spec, flips: 0, source: 'type' }))[0];
const xs = (shapes: unknown[]) => shapes.flatMap((s) => ((s as { pts?: { x: number }[] }).pts ?? []).map((p) => p.x));

describe('the block a drawing makes', () => {
  it('keeps lines, polylines, circles and arcs as strokes: a closed shape closed, a dashed layer dashed, an arc flattened', () => {
    const block = blockFromDrafts(DRAFTS)!;
    expect(block.name).toBe(DRAWN_SYMBOL_NAME);
    expect(isDrawnSymbol(block)).toBe(true);
    expect(block.paths).toHaveLength(3);
    expect(block.paths[0]).toMatchObject({ closed: true });
    expect(block.paths[0].pts).toHaveLength(4);
    expect(block.paths[1].pts.length).toBeGreaterThan(8);
    expect(block.paths[1].pts[0][0]).toBeCloseTo(-0.45, 9);
    expect(block.paths[1].pts[0][1]).toBeCloseTo(-0.9, 9);
    expect(block.paths[2]).toMatchObject({ dashed: true });
    expect(block.paths[2].closed).toBeUndefined();
  });

  it('is nothing when nothing is drawn; text and hatches are not strokes', () => {
    expect(blockFromDrafts([])).toBeNull();
    expect(blockFromDrafts([draft('t', { type: 'text', p: { x: 0, y: 0 }, text: 'D', height: 0.1 }), draft('h', { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]] })])).toBeNull();
  });

  it('opens again as the strokes it was: one polyline each, dashed kept', () => {
    const shapes = blockAsShapes(blockFromDrafts(DRAFTS)!);
    expect(shapes.map((s) => s.shape.type)).toEqual(['polyline', 'polyline', 'polyline']);
    expect(shapes.map((s) => s.dashed)).toEqual([false, false, true]);
    expect(shapes[0].shape.closed).toBe(true);
  });
});

describe('the canvas is the opening', () => {
  it('is the width by the frame depth, centred, with room for a door to swing both ways', () => {
    const w = defaultWindowSpec(), d = door('swing-left', false);
    const win = symbolCanvas({ ...w, width: 1.5, frame: { ...w.frame, depth: 0.2 } });
    expect(win.opening).toEqual({ min: { x: -0.75, y: -0.1 }, max: { x: 0.75, y: 0.1 } });
    const swing = symbolCanvas({ ...d, width: 0.9 });
    expect(swing.view.min.y).toBeLessThan(-0.9);
    expect(swing.view.max.y).toBeGreaterThan(0.9);
    expect(swing.view.min.x).toBeLessThan(swing.opening.min.x);
  });
});

describe('the engine draws a drawn symbol where it draws any plan symbol', () => {
  it('on the opening in place of the generated leaf and swing, spanning its width', () => {
    const generated = symbolOf(door('swing-left', false));
    const drawn = symbolOf(door('swing-left'));
    // Heavy: the closed leaf. Thin: the swing arc and the dashed line is its own pen.
    expect(drawn.heavy).toHaveLength(1);
    expect(drawn.dashed).toHaveLength(1);
    expect(drawn.shapes).toHaveLength(1);
    expect(drawn.heavy).not.toEqual(generated.heavy);
    const all = xs([...drawn.heavy!, ...drawn.shapes, ...drawn.dashed!]);
    expect(Math.min(...all)).toBeCloseTo(4.55, 6);
    expect(Math.max(...all)).toBeCloseTo(5.45, 6);
  });

  it('mirrors for a right-hand type: the leaf moves to the other jamb', () => {
    expect(Math.max(...xs(symbolOf(door('swing-left')).heavy!))).toBeLessThan(5);
    expect(Math.min(...xs(symbolOf(door('swing-right')).heavy!))).toBeGreaterThan(5);
  });

  it('survives a project file: the headless build reads the entry and draws the same strokes', () => {
    const [read] = readJoineryList(JSON.parse(JSON.stringify([door('swing-right')])));
    expect(read.planBlock).toEqual(door('swing-right').planBlock);
    expect(symbolOf(read)).toEqual(symbolOf(door('swing-right')));
  });

  it('draws the generated symbol again once the block is removed', () => {
    const reset = withPlanBlock([door('swing-left')], 'd1', null)[0];
    expect('planBlock' in reset).toBe(false);
    expect(symbolOf(reset)).toEqual(symbolOf(door('swing-left', false)));
  });

  it('an entry saved before blocks existed is read and drawn as it was', () => {
    const legacy = JSON.parse(JSON.stringify(door('swing-left', false)));
    const [read] = readJoineryList([legacy]);
    expect('planBlock' in read).toBe(false);
    expect(symbolOf(read)).toEqual(symbolOf(door('swing-left', false)));
  });
});
