/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #449: a joinery type's schedule views at a chosen detail, with a single line hidden. The window is a real set of meshes (four frame
 * members, a mullion in the middle and a thin glazing bead), cut by the same pipeline the schedule uses. The sheet and the PDF draw the
 * layout's prims through `ScheduleGraphic` (`SheetPaper`, `useSheetContent`), so what is asserted is the markup that component renders.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultWindowSpec, type JoinerySpec } from '@ifc-lite/create';
import type { MeshData } from '@ifc-lite/geometry';
import { readJoineryList, withHiddenLinesShown, withViewDetail, withViewLineHidden } from '@bimvoice/ifcsheet/project';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import type { ScheduleData } from './schedule-data';
import { elementViews, type ElementViews } from './element-views';
import { useProjectStore } from '@/project/project-store';
import { hideViewLine, setViewDetail, showHiddenViewLines } from './view-choice-actions';
import { ScheduleGraphic } from '@/components/viewer/joinery/ScheduleGraphic';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op,
};

/** A box of `w` x `d` x `h` metres whose middle of the footprint is `at`, base at `y0`. */
function box(w: number, d: number, h: number, at: { x: number; z: number }, y0 = 0): MeshData {
  const pts: number[] = [];
  for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) pts.push(at.x + (a * w) / 2, y0 + y * h, at.z + (b * d) / 2);
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { expressId: 1, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
}

/** 1.2 x 0.2 x 1.5 m: jambs, head and sill 60 mm, a mullion 80 mm wide in the middle, and a 20 mm bead in the left light. */
function window(at: { x: number; z: number }): MeshData[] {
  const { x, z } = at;
  return [
    box(0.06, 0.2, 1.5, { x: x - 0.57, z }), box(0.06, 0.2, 1.5, { x: x + 0.57, z }),
    box(1.08, 0.2, 0.06, { x, z }, 1.44), box(1.08, 0.2, 0.06, { x, z }),
    box(0.08, 0.2, 1.38, { x, z }, 0.06),
    box(0.02, 0.05, 0.3, { x: x - 0.3, z }, 0.6),
  ];
}

const away = (at: { x: number; z: number }) => ({ x: at.x, z: at.z - 30 });
const views = async (at = { x: 5, z: 7 }): Promise<ElementViews> => (await elementViews(window(at), { awayFrom: away(at) }))!;

const spec0: JoinerySpec = { ...defaultWindowSpec('W'), id: 'w1', mark: 'W1', width: 1.2, height: 1.5 };
const dataOf = (spec: JoinerySpec): ScheduleData => ({
  levels: ['Ground'], entries: [{ key: 'w1', kind: 'window', spec, mark: 'W1', name: 'W', width: 1.2, height: 1.5, counts: { Ground: 1 }, total: 1, occurrences: [] }],
});
const lay = (spec: JoinerySpec, v: ElementViews) => layoutSchedule(dataOf(spec), labels, { scale: 20, views: new Map([['w1', v]]) });
const lines = (l: ReturnType<typeof lay>, view: 'front' | 'plan' | 'section'): Extract<SchedulePrim, { kind: 'path' }>[] =>
  l.prims.filter((p): p is Extract<SchedulePrim, { kind: 'path' }> => p.kind === 'path' && p.view === view);
const picks = (l: ReturnType<typeof lay>) => l.prims.flatMap((p) => (p.kind === 'path' && p.pick ? [p.pick.line] : []));

/** The id of the mullion's left edge in the front view: 80 mm wide, between the 60 mm sill and head, so x = -40 mm from y = 60 to 1440. */
const MULLION = 'front:-40,60,-40,1440';

/** The mullion's long vertical edge in the front view, in the type frame. */
function mullionEdge(v: ElementViews) {
  const found = v.front.lines.find((l) => l.kind !== 'hatch' && Math.abs(l.a.x - l.b.x) < 1e-4 && Math.abs(Math.abs(l.a.x) - 0.04) < 2e-3 && Math.abs(l.a.y - l.b.y) > 1);
  assert.ok(found, 'the mullion edge is cut from the mesh');
  return found;
}

describe('detail level of a type\'s views', () => {
  it('outline only keeps the lines on the box of each view, fewer than frame and leaves, and those fewer than everything', async () => {
    const v = await views();
    const all = lay(withViewDetail(spec0, 'all'), v), frame = lay(withViewDetail(spec0, 'frame'), v), outline = lay(withViewDetail(spec0, 'outline'), v);
    for (const name of ['front', 'plan', 'section'] as const) {
      assert.ok(lines(outline, name).length < lines(frame, name).length || lines(frame, name).length < lines(all, name).length, name);
      assert.ok(lines(outline, name).length <= lines(frame, name).length && lines(frame, name).length <= lines(all, name).length, name);
    }
    assert.ok(lines(outline, 'front').length < lines(all, 'front').length, 'the mullion and the bead are not outline');
    assert.ok(lines(frame, 'front').length < lines(all, 'front').length, 'the 20 mm bead is smaller than half a member');
    // Every outline line sits on the view's box (front: x = +-0.6 or y = 0 or 1.5; k = 20 mm per metre... paper mm = metres * 1000 / 20 = 50).
    const xs = lines(outline, 'front').flatMap((p) => p.pts.map((q) => q.x)), ys = lines(outline, 'front').flatMap((p) => p.pts.map((q) => q.y));
    const onBox = lines(outline, 'front').every((p) => p.pts.every((q) => q.x === Math.min(...xs) || q.x === Math.max(...xs)) || p.pts.every((q) => q.y === Math.min(...ys) || q.y === Math.max(...ys)));
    assert.ok(onBox);
  });

  it('a type without a choice draws as it always did', async () => {
    const v = await views();
    const plain = lay(spec0, v);
    assert.deepEqual(plain, lay(withViewDetail(spec0, 'all'), v));
    assert.equal(withViewDetail(spec0, 'all').view, undefined, 'everything is the default and leaves no field');
  });
});

describe('hiding a single line', () => {
  it('removes that line from the front view and no other, and showing hidden lines brings it back', async () => {
    const v = await views();
    const edge = mullionEdge(v);
    const before = lay(spec0, v);
    const ids = picks(lay(spec0, v));
    const id = MULLION;
    assert.ok(ids.includes(id), 'the mullion edge has this id');
    const hidden = lay(withViewLineHidden(spec0, id), v);
    assert.equal(lines(hidden, 'front').length, lines(before, 'front').length - 1);
    assert.deepEqual(picks(hidden), ids.filter((i) => i !== id));
    assert.equal(lines(hidden, 'plan').length, lines(before, 'plan').length, 'the other views are untouched');
    assert.ok(edge);
    assert.deepEqual(lay(withHiddenLinesShown(withViewLineHidden(spec0, id)), v), before);
  });

  it('prints on the sheet and in the PDF: the markup ScheduleGraphic draws for them has outline only and no mullion line', async () => {
    const v = await views();
    const id = MULLION;
    assert.ok(picks(lay(spec0, v)).includes(id));
    const chosen = withViewLineHidden(withViewDetail(spec0, 'outline'), id);
    const plain = renderToStaticMarkup(<ScheduleGraphic layout={lay(spec0, v)} />);
    const outline = renderToStaticMarkup(<ScheduleGraphic layout={lay(withViewDetail(spec0, 'outline'), v)} />);
    const out = renderToStaticMarkup(<ScheduleGraphic layout={lay(chosen, v)} />);
    const paths = (m: string) => (m.match(/<path /g) ?? []).length;
    assert.ok(paths(outline) < paths(plain), 'outline only draws fewer lines than everything');
    assert.ok(paths(out) <= paths(outline), 'a hidden line never adds one');
    const hiddenOnly = renderToStaticMarkup(<ScheduleGraphic layout={lay(withViewLineHidden(spec0, id), v)} />);
    assert.equal(paths(hiddenOnly), paths(plain) - 1, 'exactly the one line goes');
  });

  it('every schedule that shows the type draws the same choice (the choice is on the type)', async () => {
    const v = await views();
    const id = picks(lay(spec0, v))[0];
    const chosen = withViewLineHidden(withViewDetail(spec0, 'frame'), id);
    const a = layoutSchedule(dataOf(chosen), labels, { scale: 20, views: new Map([['w1', v]]) });
    const b = layoutSchedule({ ...dataOf(chosen), content: {} }, labels, { scale: 20, views: new Map([['w1', v]]) });
    assert.deepEqual(a, b);
  });
});

describe('kept after reopening and after a model update', () => {
  it('survives the project file', async () => {
    const v = await views();
    const id = picks(lay(spec0, v))[0];
    const chosen = withViewLineHidden(withViewDetail(spec0, 'outline'), id);
    const [reopened] = readJoineryList(JSON.parse(JSON.stringify([chosen])));
    assert.deepEqual(reopened.view, { detail: 'outline', hidden: [id] });
    assert.deepEqual(lay(reopened, v), lay(chosen, v));
  });

  it('a malformed stored choice is dropped, not trusted', () => {
    const [read] = readJoineryList([{ ...spec0, view: { detail: 'everything', hidden: ['front:1,2', 7, 'front:1,2,3,4'] } }]);
    assert.deepEqual(read.view, { hidden: ['front:1,2,3,4'] });
  });

  it('a hidden line stays hidden when the model is updated and the type\'s shape is unchanged, and not when the shape changes', async () => {
    const v = await views({ x: 5, z: 7 });
    const id = MULLION;
    assert.ok(picks(lay(spec0, v)).includes(id));
    const chosen = withViewLineHidden(spec0, id);
    // The model was edited elsewhere: the window now stands 12 m east and 3 m north, same shape; re-cut from scratch.
    const moved = await views({ x: 17, z: 10 });
    assert.equal(lines(lay(chosen, moved), 'front').length, lines(lay(spec0, moved), 'front').length - 1);
    assert.ok(!picks(lay(chosen, moved)).includes(id));
    assert.equal(lines(lay(chosen, moved), 'front').length, lines(lay(chosen, v), 'front').length, 'the same lines are drawn after the update');
    // A wider mullion is another shape: its edge is another line, so the hidden id hides nothing else.
    const wider = await elementViews([...window({ x: 5, z: 7 }).slice(0, 4), box(0.12, 0.2, 1.38, { x: 5, z: 7 }, 0.06)], { awayFrom: away({ x: 5, z: 7 }) });
    assert.equal(lines(lay(chosen, wider!), 'front').length, lines(lay(spec0, wider!), 'front').length, 'nothing else disappears');
  });
});

describe('the schedule tab\'s actions write the type in the catalogue', () => {
  it('detail, a hidden line and show-again land on the catalogue type that every schedule reads', () => {
    useProjectStore.setState({ joineryTypes: [spec0] });
    const view = () => useProjectStore.getState().joineryTypes![0].view;
    setViewDetail('w1', 'outline');
    hideViewLine('w1', MULLION);
    assert.deepEqual(view(), { detail: 'outline', hidden: [MULLION] });
    assert.equal(useProjectStore.getState().dirty, true, 'the project is marked changed, so it is saved');
    showHiddenViewLines('w1');
    assert.deepEqual(view(), { detail: 'outline' });
    hideViewLine('nobody', MULLION);
    assert.deepEqual(view(), { detail: 'outline' }, 'an unknown type changes nothing');
  });
});
