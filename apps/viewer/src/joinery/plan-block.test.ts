/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A DXF block as the plan symbol of a door type (#448), drawn where the plan, the sheet and the PDF draw an opening: through
 * `openingSymbols` (the one path of the tab, the sheets and the export) and the schedule's plan view. The fixture is the engine's.
 */

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { defaultDoorSpec, type JoinerySpec } from '@ifc-lite/create';
import { readDxfBlock } from '@bimvoice/ifcsheet/project';
import { openingSymbols } from '@/drafting/opening-symbols';
import { planSymbol } from './symbols';
import { viewPrims } from './element-views-layout';
import type { ElementViews } from './element-views';

const DXF = readFileSync(new URL('../../../../packages/ifcsheet/src/__fixtures__/door-window-blocks.dxf', import.meta.url), 'utf8');
const BLOCK = readDxfBlock(DXF, 'DOOR90').symbol!;

const door = (operation: 'swing-left' | 'swing-right', withBlock = true): JoinerySpec => ({
  ...defaultDoorSpec(), width: 0.9, panels: [{ col: 0, row: 0, operation }], ...(withBlock ? { planBlock: BLOCK } : {}),
});
/** A 0.9 m door in a 0.2 m wall, upright, at x 5; the plan is cut at 1.2 m. */
const mesh = (): MeshData => {
  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [0, 2.1]) for (const z of [-0.1, 0.1]) pts.push(x, y, z);
  return { expressId: 7, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 0, 2], localToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
};
const plan = { axis: 'y' as const, position: 1.2, flipped: false };
const symbolOf = (spec: JoinerySpec) => openingSymbols([mesh()], plan, () => 0, () => ({ spec, flips: 0, source: 'type' }))[0];
const xs = (s: { type: string; pts?: { x: number }[] }) => (s.pts ?? []).map((p) => p.x);

describe('a door type with a DXF block as its plan symbol', () => {
  it('is drawn on the opening where the plan, sheet and PDF draw it, instead of the generated leaf and swing', () => {
    const generated = symbolOf(door('swing-left', false));
    const custom = symbolOf(door('swing-left'));
    assert.equal(generated.shapes.filter((s) => s.type === 'polyline').length > 0 && generated.heavy!.length > 0, true);
    // The block: its one closed polyline (the leaf) heavy, its swing arc thin, nothing dashed.
    assert.equal(custom.heavy!.length, 1);
    assert.equal(custom.shapes.length, 1);
    assert.equal(custom.dashed!.length, 0);
    assert.notDeepEqual(custom.heavy, generated.heavy);
    // On the opening: the block's 0.9 m width spans the door's, x 4.55 to 5.45.
    const all = [...custom.heavy!, ...custom.shapes].flatMap((s) => xs(s as never));
    assert.ok(Math.abs(Math.min(...all) - 4.55) < 1e-6 && Math.abs(Math.max(...all) - 5.45) < 1e-6);
  });

  it('is mirrored for a right-hand type: the leaf moves to the other jamb', () => {
    const leafX = (op: 'swing-left' | 'swing-right') => xs(symbolOf(door(op)).heavy![0] as never);
    assert.ok(Math.max(...leafX('swing-left')) < 5, 'left-hand: leaf on the -X side');
    assert.ok(Math.min(...leafX('swing-right')) > 5, 'right-hand: leaf on the +X side');
  });

  it('is drawn in the schedule\'s plan view in place of the plan cut from the model', () => {
    const lines = { lines: [{ a: { x: -0.45, y: -0.1 }, b: { x: 0.45, y: -0.1 }, kind: 'cut' as const }], min: { x: -0.45, y: -0.1 }, max: { x: 0.45, y: 0.1 } };
    const views = { width: 0.9, depth: 0.2, height: 2.1, front: { lines: [], min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }, plan: lines, section: { lines: [], min: { x: 0, y: 0 }, max: { x: 0, y: 0 } } } as unknown as ElementViews;
    const planPaths = (spec: JoinerySpec) => viewPrims(views, spec, { fx: 0, base: 0 }, 10, 'handle').filter((p) => p.kind === 'path' && p.view === 'plan');
    assert.equal(planPaths(door('swing-left', false)).length, 1, 'without a block: the plan cut from the model');
    const custom = planPaths(door('swing-left'));
    assert.equal(custom.length, BLOCK.paths.length);
    assert.ok(custom.some((p) => p.kind === 'path' && p.closed), 'the leaf');
  });

  it('a type without a block draws exactly the generated symbol it always did', () => {
    const strokes = planSymbol(door('swing-left', false), { cutZ: 1.2 });
    // The door frame cut and the leaf open to the interior with its swing arc (a golden of the generated symbol).
    assert.deepEqual(strokes.map((s) => [s.weight, s.pts.length, !!s.closed, !!s.dashed]), GENERATED_DOOR);
  });
});

const GENERATED_DOOR: Array<[string, number, boolean, boolean]> = [['cut', 4, true, false], ['cut', 4, true, false], ['outline', 4, true, false], ['thin', 17, false, false]];
