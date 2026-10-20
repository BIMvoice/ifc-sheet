/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { defaultDisciplineLevel, disciplineViewFor, type DisciplineId } from './discipline-views';
import { planViewFor } from './view-defaults';
import type { ProjectLevel, ProjectView } from './types';

/**
 * The three starters on real models, through the real pipeline (parser, wasm
 * geometry, section generator, `styledDrawing` with the view's omit
 * predicate), asserted on the elements the generated drawing has primitives
 * for.
 *
 * `__fixtures__/disciplines.ifc` is hand-written IFC4 (boxes, no external
 * data): a Foundation storey at -1.2 m with two pad footings, a foundation
 * wall (LoadBearing TRUE) and a BASESLAB ground slab; a Ground floor at 0 with
 * a load-bearing wall (TRUE) holding a door, a partition (LoadBearing FALSE)
 * and a column. FZK-Haus has no IfcFooting, no storey below ±0.00 and no
 * LoadBearing on any wall (only on its 45 beams and rafters), so it cannot
 * show the foundation walls or the wall rule; it shows the roof, which the
 * fixture lacks.
 */

const view = (id: DisciplineId, level: ProjectLevel): ProjectView => ({ ...disciplineViewFor(id, level, []), createdAt: 0 }) as ProjectView;
const level = (m: LoadedPlanModel, name: string): ProjectLevel => {
  const found = m.levels.find((l) => l.name === name);
  assert.ok(found, `the model has a storey ${name}`);
  return found;
};
const has = (names: Set<string>, ...wanted: string[]) => wanted.forEach((n) => assert.ok(names.has(n), `${n} is drawn (drawn: ${[...names].join(', ')})`));
const lacks = (names: Set<string>, ...unwanted: string[]) => unwanted.forEach((n) => assert.ok(!names.has(n), `${n} is not drawn`));

describe('discipline plans on the hand-written fixture', { skip: planModelMissing(fileURLToPath(new URL('./__fixtures__/disciplines.ifc', import.meta.url))) }, () => {
  let m: LoadedPlanModel;
  before(async () => { m = await loadPlanModel(fileURLToPath(new URL('./__fixtures__/disciplines.ifc', import.meta.url))); });

  it('a foundation plan draws the footings, the foundation wall and the ground slab, and no door or upper wall', async () => {
    const foundation = view('foundation', m.levels.at(-1)!);
    const shown = m.drawnNames(await m.planOf(foundation));
    has(shown, 'Footing 1', 'Footing 2', 'Foundation wall', 'Ground slab');
    lacks(shown, 'Door', 'Upper wall', 'Partition', 'Column');
    // The filter did that: the same view without it draws the wall above (the door is hidden by the view's own graphics).
    const unfiltered = m.drawnNames(await m.planOf(foundation, { omits: 'none' }));
    has(unfiltered, 'Upper wall', 'Partition');
  });

  it('a foundation plan is in its style: the foundation preset, heavy walls and footings, no doors', () => {
    const { graphics } = view('foundation', m.levels.at(-1)!);
    assert.equal(graphics?.presetId, 'preset-monochrome');
    assert.equal(graphics?.categories?.walls?.lineWeight, 'heavy');
    assert.equal(graphics?.categories?.other?.lineWeight, 'heavy');
    assert.equal(graphics?.categories?.doors?.visible, false);
  });

  it('a structural plan of the ground floor draws the load-bearing wall and the column, and no door, partition or foundation', async () => {
    const shown = m.drawnNames(await m.planOf(view('structural', level(m, 'Ground floor'))));
    has(shown, 'Upper wall', 'Column');
    lacks(shown, 'Door', 'Partition', 'Footing 1', 'Foundation wall', 'Ground slab');
    // Without the filter the partition (LoadBearing FALSE) is drawn: the property decides.
    has(m.drawnNames(await m.planOf(view('structural', level(m, 'Ground floor')), { omits: 'none' })), 'Partition');
  });

  it('a roof plan of a model without a roof draws nothing of the building', async () => {
    const shown = m.drawnNames(await m.planOf(view('roof', m.levels[0])));
    assert.deepEqual([...shown], []);
  });
});

describe('discipline plans on FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let m: LoadedPlanModel;
  before(async () => { m = await loadPlanModel(FZK_HAUS); });

  it('a structural plan draws no door, window, furniture or stair, and (no wall has LoadBearing here) no wall', async () => {
    const drawing = await m.planOf(view('structural', level(m, 'Erdgeschoss')));
    const classes = m.drawnClasses(drawing);
    for (const cls of classes) assert.ok(['IfcBeam', 'IfcMember', 'IfcSlab', 'IfcColumn'].includes(cls), `${cls} is framing`);
    assert.ok(classes.size > 0, 'the plan is not empty');
    // Not vacuous: the unfiltered view of the same floor does draw walls.
    assert.ok(m.drawnClasses(await m.planOf(view('structural', level(m, 'Erdgeschoss')), { omits: 'none' })).has('IfcWallStandardCase'));
  });

  it('a roof plan draws the roof slabs from above and no wall', async () => {
    const drawing = await m.planOf(view('roof', level(m, 'Dachgeschoss')));
    const shown = m.drawnNames(drawing);
    assert.deepEqual([...shown].sort(), ['Dach-1', 'Dach-2']);
    assert.ok(drawing.lines.length > 0);
    assert.ok(!m.drawnClasses(drawing).has('IfcWallStandardCase'));
    // Unfiltered, the same plane also sees the floor slabs, windows and the ground below.
    assert.ok(m.drawnNames(await m.planOf(view('roof', level(m, 'Dachgeschoss')), { omits: 'none' })).size > shown.size);
  });

  it('a foundation plan draws the base slab only: FZK has no footing and no storey below ground', async () => {
    const shown = m.drawnNames(await m.planOf(view('foundation', level(m, 'Erdgeschoss'))));
    assert.deepEqual([...shown], ['Bodenplatte']);
  });

  it('leaves the plan, section and elevation of a view without a discipline as they were', async () => {
    const ground = level(m, 'Erdgeschoss');
    const views: ProjectView[] = [
      planViewFor(ground, []),
      { id: 's', name: 's', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: 5, flipped: false } },
      { id: 'e', name: 'e', kind: 'elevation', createdAt: 0, direction: 'south' },
    ];
    for (const v of views) {
      const now = await m.planOf(v);
      const before = await m.planOf(v, { omits: 'main' });
      assert.ok(before.lines.length > 0, `${v.kind} has lines`);
      assert.equal(now.lines.length, before.lines.length, `${v.kind} lines`);
      assert.equal(now.cutPolygons.length, before.cutPolygons.length, `${v.kind} cut polygons`);
      assert.deepEqual([...m.drawnIds(now)].sort(), [...m.drawnIds(before)].sort(), `${v.kind} elements`);
    }
  });
});

describe('a roof plan over a lower wing with its own roof', { skip: planModelMissing(fileURLToPath(new URL('./__fixtures__/roof-two-wings.ifc', import.meta.url))) }, () => {
  let m: LoadedPlanModel;
  before(async () => { m = await loadPlanModel(fileURLToPath(new URL('./__fixtures__/roof-two-wings.ifc', import.meta.url))); });

  it('draws the main roof and the wing roof below the top storey floor', async () => {
    const top = defaultDisciplineLevel('roof', m.levels);
    assert.equal(top?.name, 'Upper floor', 'the roof plan sits on the top storey');
    assert.ok(top);
    const shown = m.drawnNames(await m.planOf(view('roof', top)));
    has(shown, 'Main roof', 'Wing roof');
  });
});

describe('a roof plan on a top storey named Roof, over a slab roof wholly below that level', { skip: planModelMissing(fileURLToPath(new URL('./__fixtures__/roof-storey.ifc', import.meta.url))) }, () => {
  let m: LoadedPlanModel;
  before(async () => { m = await loadPlanModel(fileURLToPath(new URL('./__fixtures__/roof-storey.ifc', import.meta.url))); });

  it('draws the main slab roof below the Roof level and the lower wing\'s slab roof, and no wall', async () => {
    const top = defaultDisciplineLevel('roof', m.levels);
    assert.equal(top?.name, 'Roof', 'the roof plan sits on the Roof storey, above every roof');
    assert.ok(top);
    const shown = m.drawnNames(await m.planOf(view('roof', top)));
    has(shown, 'Main roof', 'Wing roof');
    lacks(shown, 'Upper wall');
  });

  it('draws them from any storey: the cut is clamped to the model top, the depth runs down from there', async () => {
    for (const name of ['Ground floor', 'Upper floor']) has(m.drawnNames(await m.planOf(view('roof', level(m, name)))), 'Main roof', 'Wing roof');
  });
});
