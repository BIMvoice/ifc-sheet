/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #492: a dashed opening line drawn on the front view of one window type prints in the schedule and the PDF for that type, in every
 * schedule that shows the type, not for another type; it is kept when the project is saved and reopened and when a model update moves
 * the window. The line is drawn through the drafting store (the entity commands use) in the open drafting view of the type. The sheet and
 * the PDF draw the layout's prims through `ScheduleGraphic` (see `view-choice.test.tsx`), so what is asserted is that markup.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultWindowSpec, type JoineryViewDraft, type JoinerySpec } from '@ifc-lite/create';
import type { MeshData } from '@ifc-lite/geometry';
import { joineryViewDraftPrims, readJoineryList } from '@bimvoice/ifcsheet/project';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import type { ScheduleData } from './schedule-data';
import { elementViews, type ElementViews } from './element-views';
import { useProjectStore, projectDocument } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { commitDrafts, draftsOfView, editDrafts, newDraft, undoDrafts } from '@/drafting/draft-store';
import { joineryDraftViewId } from './view-draft-id';
import { openJoineryViewDrafts } from './view-drafts';
import { attachDraftingView, cancelCommand, clickDrawing, pressEnter, submitCommandLine, useDraftingSession } from '@/drafting/session';
import { packageCurrentProject } from '@/project/package/project-save';
import { ScheduleGraphic } from '@/components/viewer/joinery/ScheduleGraphic';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op,
};

function box(w: number, d: number, h: number, at: { x: number; z: number }, y0 = 0): MeshData {
  const pts: number[] = [];
  for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) pts.push(at.x + (a * w) / 2, y0 + y * h, at.z + (b * d) / 2);
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { expressId: 1, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
}

/** 1.2 x 0.2 x 1.5 m: jambs, head and sill 60 mm. */
const window = ({ x, z }: { x: number; z: number }): MeshData[] => [
  box(0.06, 0.2, 1.5, { x: x - 0.57, z }), box(0.06, 0.2, 1.5, { x: x + 0.57, z }), box(1.08, 0.2, 0.06, { x, z }, 1.44), box(1.08, 0.2, 0.06, { x, z }),
];
const views = async (at = { x: 5, z: 7 }): Promise<ElementViews> => (await elementViews(window(at), { awayFrom: { x: at.x, z: at.z - 30 } }))!;

const specOf = (id: string, mark: string): JoinerySpec => ({ ...defaultWindowSpec(mark), id, mark, width: 1.2, height: 1.5 });
const W1 = 'w1', W2 = 'w2';
const entry = (spec: JoinerySpec) => ({ key: spec.id!, kind: 'window' as const, spec, mark: spec.mark, name: spec.name, width: 1.2, height: 1.5, counts: { Ground: 1 }, total: 1, occurrences: [] });
const dataOf = (...specs: JoinerySpec[]): ScheduleData => ({ levels: ['Ground'], entries: specs.map(entry) });
const lay = (data: ScheduleData, v: ElementViews) => layoutSchedule(data, labels, { scale: 20, views: new Map(data.entries.map((e) => [e.key, v])) });
const typeOf = (id: string) => useProjectStore.getState().joineryTypes!.find((t) => t.id === id)!;
const dashed = (l: ReturnType<typeof lay>): Extract<SchedulePrim, { kind: 'path' }>[] => l.prims.filter((p): p is Extract<SchedulePrim, { kind: 'path' }> => p.kind === 'path' && p.view === 'front' && p.dashed === true);

/** An opening line from the lower left corner of the frame to the middle of the head, in the front view's metres. */
const OPENING = { type: 'line' as const, a: { x: -0.6, y: 0 }, b: { x: 0, y: 1.5 } };

beforeEach(() => {
  useProjectStore.setState({
    joineryTypes: [specOf(W1, 'W1'), specOf(W2, 'W2')],
    drafts: [],
    draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, { id: 'opening', name: 'Opening', color: '#18181b', visible: true, locked: false, lineType: 'dashed', lineWeight: 0.18 }],
  });
});

/** Opens the front view of `W1`, draws the opening line on the dashed layer through the drafting store, closes the view. */
function drawOpening(typeId = W1): void {
  const close = openJoineryViewDrafts(typeId, 'front');
  editDrafts({ add: [newDraft(joineryDraftViewId(typeId, 'front'), 'opening', OPENING)] });
  close();
}

describe('drawing on a type\'s front view', () => {
  it('prints in the schedule and the PDF for that type, in a second schedule that shows it, and not for another type', async () => {
    const v = await views();
    const before = lay(dataOf(typeOf(W1), typeOf(W2)), v);
    assert.equal(dashed(before).length, 0, 'a type with no drawing has no dashed front line (the opening symbol is its own view)');
    drawOpening();
    const w1 = typeOf(W1), w2 = typeOf(W2);
    assert.equal(w1.view?.drafts?.front?.length, 1, 'the line is on the type');
    assert.equal(w1.view?.drafts?.front?.[0].lineType, 'dashed', 'with the pen of its layer');
    assert.equal(w2.view, undefined, 'another type is untouched');

    const [onW1] = dashed(lay(dataOf(w1), v));
    assert.ok(onW1, 'the schedule draws it dashed');
    const k = 1000 / 20;
    assert.equal(onW1.w, 0.18);
    // front view: x = fx + x*k, y = base - y*k, so the line runs from the lower left to the head's middle: dx = 0.6*k, dy = 1.5*k.
    assert.ok(Math.abs((onW1.pts[1].x - onW1.pts[0].x) - 0.6 * k) < 1e-6 && Math.abs((onW1.pts[0].y - onW1.pts[1].y) - 1.5 * k) < 1e-6);

    const second = lay(dataOf(w1, w2), v);
    assert.equal(dashed(second).length, 1, 'a second schedule that shows the type prints it, once, for the type that has it');
    assert.deepEqual(dashed(lay(dataOf(w2), v)), [], 'not for another type');

    // The sheet's SVG and the PDF are what ScheduleGraphic renders from the layout.
    const svg = renderToStaticMarkup(<ScheduleGraphic layout={lay(dataOf(w1), v)} />);
    const plain = renderToStaticMarkup(<ScheduleGraphic layout={lay(dataOf(w2), v)} />);
    assert.ok((svg.match(/stroke-dasharray="1.2 0.8"/g) ?? []).length > (plain.match(/stroke-dasharray="1.2 0.8"/g) ?? []).length);
    assert.ok(svg.includes(`d="M${onW1.pts[0].x.toFixed(2)},${onW1.pts[0].y.toFixed(2)}L${onW1.pts[1].x.toFixed(2)},${onW1.pts[1].y.toFixed(2)}"`), 'the line itself is in the markup');
  });

  it('text and a hatch drawn there print too, the text over its view and the hatch as lines inside its loop', async () => {
    const v = await views();
    const close = openJoineryViewDrafts(W1, 'plan');
    const id = joineryDraftViewId(W1, 'plan');
    editDrafts({ add: [
      newDraft(id, '0', { type: 'text', p: { x: -0.2, y: 0.05 }, text: 'SWING', height: 0.05, rotation: 0 }),
      newDraft(id, '0', { type: 'hatch', loops: [[{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.1 }, { x: -0.5, y: 0.1 }]], pattern: 'ANSI31', scale: 1, angle: 45 }),
    ] });
    close();
    const l = lay(dataOf(typeOf(W1)), v);
    const text = l.prims.find((p) => p.kind === 'text' && p.text === 'SWING');
    assert.ok(text && text.kind === 'text' && text.view === 'plan' && Math.abs(text.size - 0.05 * 50) < 1e-9, 'text at the schedule scale');
    const plain = lay(dataOf(typeOf(W2)), v);
    const hatchLines = l.prims.filter((p) => p.kind === 'path' && p.view === 'plan').length - plain.prims.filter((p) => p.kind === 'path' && p.view === 'plan').length;
    assert.ok(hatchLines > 5, `the hatch is printed as lines (${hatchLines})`);
    // A schedule that shows no plan leaves the plan's drawing out with the plan, text included.
    const noPlan = layoutSchedule({ ...dataOf(typeOf(W1)), content: { symbols: { plan: false } } }, labels, { scale: 20, views: new Map([[W1, v]]) });
    assert.ok(!noPlan.prims.some((p) => (p.kind === 'text' || p.kind === 'path') && p.view === 'plan'));
  });

  it('is kept by the project file: saved with the type, reopened, and no working copy in the file', async () => {
    const v = await views();
    const close = openJoineryViewDrafts(W1, 'front');
    editDrafts({ add: [newDraft(joineryDraftViewId(W1, 'front'), 'opening', OPENING)] });
    // Saved while the view is still open: the working copy is not in the file, the type is.
    let text: string;
    try {
      text = serializeProject(projectDocument());
      const file = JSON.parse(text) as { drafts: { viewId: string }[] };
      assert.deepEqual(file.drafts.filter((d) => d.viewId.startsWith('joinery:')), []);
    } finally {
      close();
    }
    const reopened = parseProjectFile(text);
    const [w1] = reopened.joineryTypes!.filter((t) => t.id === W1);
    assert.deepEqual(w1.view?.drafts, typeOf(W1).view?.drafts);
    assert.deepEqual(dashed(lay(dataOf(w1), v)), dashed(lay(dataOf(typeOf(W1)), v)));
    assert.equal(dashed(lay(dataOf(w1), v)).length, 1);
    assert.equal(draftsOfView(joineryDraftViewId(W1, 'front')).length, 0, 'closing the view takes the working copy away');
  });

  it('opens again with what was drawn, and a change in the open view reaches the type, undo included', () => {
    drawOpening();
    const id = joineryDraftViewId(W1, 'front');
    const close = openJoineryViewDrafts(W1, 'front');
    assert.equal(draftsOfView(id).length, 1, 'the type\'s shapes are the working copy');
    editDrafts({ add: [newDraft(id, '0', { type: 'circle', c: { x: 0, y: 0.7 }, r: 0.1 })] });
    assert.equal(typeOf(W1).view?.drafts?.front?.length, 2);
    undoDrafts();
    assert.equal(typeOf(W1).view?.drafts?.front?.length, 1, 'undo takes it off the type too');
    commitDrafts(useProjectStore.getState().drafts.filter((d) => d.viewId !== id));
    assert.equal(typeOf(W1).view, undefined, 'drawing nothing leaves no field');
    close();
  });

  it('a stored draft the drafting reader refuses stays on the type when the view is opened and closed, and is logged', () => {
    const broken = { id: 'odd', shape: { type: 'line', a: { x: 0, y: 0 } } } as unknown as JoineryViewDraft;
    useProjectStore.setState({ joineryTypes: [{ ...specOf(W1, 'W1'), view: { drafts: { front: [broken] } } }, specOf(W2, 'W2')] });
    const warned: unknown[][] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => { warned.push(args); };
    try {
      const close = openJoineryViewDrafts(W1, 'front');
      assert.equal(draftsOfView(joineryDraftViewId(W1, 'front')).length, 0, 'it cannot be edited, so it is not in the working copy');
      editDrafts({ add: [newDraft(joineryDraftViewId(W1, 'front'), 'opening', OPENING)] });
      close();
    } finally {
      console.warn = warn;
    }
    assert.ok(warned.some((a) => String(a[0]).includes('odd')), 'the draft left out is logged');
    assert.deepEqual(typeOf(W1).view?.drafts?.front?.map((d) => d.id).sort(), [typeOf(W1).view!.drafts!.front!.find((d) => d.id !== 'odd')!.id, 'odd'].sort(), 'the new line and the one that cannot be edited');
    // Opening and closing without drawing changes nothing.
    const before = JSON.stringify(typeOf(W1).view);
    openJoineryViewDrafts(W1, 'front')();
    assert.equal(JSON.stringify(typeOf(W1).view), before);
  });

  it('keeps its place on the type\'s view when a model update moves the window', async () => {
    drawOpening();
    const at = await views({ x: 5, z: 7 });
    const moved = await views({ x: 17, z: 10 });
    const a = dashed(lay(dataOf(typeOf(W1)), at)), b = dashed(lay(dataOf(typeOf(W1)), moved));
    assert.equal(a.length, 1);
    // Both are cut in the type's own frame, so the drawn line lands on the same place on the card in both (to the float noise of the cut's width, a thousandth of a millimetre).
    assert.equal(b.length, 1);
    a[0].pts.forEach((q, i) => { assert.ok(Math.abs(q.x - b[0].pts[i].x) < 1e-3 && Math.abs(q.y - b[0].pts[i].y) < 1e-3, `end ${i}`); });
    assert.equal(joineryViewDraftPrims(typeOf(W1).view!.drafts!.front!, 50).length, 1);
  });

  it('a stored shape the file damaged is dropped, not trusted', () => {
    const [spec] = readJoineryList([{ ...specOf(W1, 'W1'), view: { drafts: { front: [{ id: 'a', shape: { type: 'line', a: { x: 0, y: 0 } } }, { id: 'b', shape: { type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false }, lineType: 'dashed' }, { id: 'c', shape: { type: 'dimension' } }] } } }]);
    assert.deepEqual(spec.view?.drafts?.front?.map((d) => d.id), ['b']);
  });
});

describe('entering a view with a double-click', () => {
  it('every type with views has a region for its front, plan and section, and the front one holds the front view', async () => {
    const v = await views();
    const l = lay(dataOf(typeOf(W1), typeOf(W2)), v);
    assert.deepEqual(l.regions!.filter((r) => r.type === W1).map((r) => r.view), ['front', 'plan', 'section']);
    const front = l.regions!.find((r) => r.type === W2 && r.view === 'front')!;
    const lines = l.prims.filter((p): p is Extract<SchedulePrim, { kind: 'path' }> => p.kind === 'path' && p.view === 'front' && !!p.pick && p.pick.type === W2);
    assert.ok(lines.length > 0, 'the type\'s front lines are laid out, so the box check below has something to check');
    for (const p of lines) for (const q of p.pts) assert.ok(q.x >= front.box.x && q.x <= front.box.x + front.box.w && q.y >= front.box.y && q.y <= front.box.y + front.box.h);
  });
});

describe('commands in a type\'s view', () => {
  const said = () => useDraftingSession.getState().history.map((h) => JSON.stringify(h)).join('\n');
  const close: (() => void)[] = [];
  beforeEach(() => {
    cancelCommand();
    useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
    attachDraftingView(null, 'front', () => []);
  });
  afterEach(() => { close.splice(0).forEach((c) => c()); attachDraftingView(null, 'front', () => []); });

  it('refuses DIMLINEAR with a message and loses nothing; a line still persists', () => {
    close.push(openJoineryViewDrafts(W1, 'front'));
    const id = joineryDraftViewId(W1, 'front');
    attachDraftingView(id, 'front', () => []);
    submitCommandLine('L', null);
    clickDrawing({ x: 0, y: 0 }, 0.05, false);
    clickDrawing({ x: 0.5, y: 0.5 }, 0.05, false);
    pressEnter();
    assert.equal(typeOf(W1).view?.drafts?.front?.length, 1, 'the line is on the type');
    for (const name of ['DIMLINEAR', 'DIMALIGNED', 'LEADER', 'DIMRADIUS', 'DIMANGULAR', 'LEVEL']) {
      useDraftingSession.setState({ history: [] });
      submitCommandLine(name, null);
      assert.equal(useDraftingSession.getState().commandId, null, `${name} did not start`);
      assert.match(said(), /joinery\.draft\.refused/, name);
    }
    assert.equal(draftsOfView(id).length, 1, 'nothing was added or lost');
    assert.equal(typeOf(W1).view?.drafts?.front?.length, 1);
  });

  it('refuses every command that makes a shape the type does not store, and allows the ones that make a stored one', async () => {
    const { DRAFT_COMMANDS } = await import('@/drafting/commands/registry');
    const { JOINERY_VIEW_COMMANDS } = await import('./view-draft-id');
    const { DRAW_COMMANDS } = await import('@/drafting/commands/draw');
    const { MODIFY_COMMANDS } = await import('@/drafting/commands/modify');
    for (const c of [...DRAW_COMMANDS, ...MODIFY_COMMANDS]) assert.ok(JOINERY_VIEW_COMMANDS.has(c.id), `${c.id} is a draw or modify command`);
    for (const id of ['dimaligned', 'dimlinear', 'leader', 'dimangular', 'level', 'axis', 'symbol', 'tag']) assert.ok(DRAFT_COMMANDS.some((c) => c.id === id) && !JOINERY_VIEW_COMMANDS.has(id), id);
  });
});

describe('saving the package while a type\'s view is open', () => {
  it('does not write the view\'s working copy into the package, and keeps the type\'s shapes', async () => {
    const close = openJoineryViewDrafts(W1, 'front');
    try {
      editDrafts({ add: [newDraft(joineryDraftViewId(W1, 'front'), 'opening', OPENING)] });
      assert.equal(useProjectStore.getState().drafts.filter((d) => d.viewId.startsWith('joinery:')).length, 1, 'the working copy is in the store');
      const packaged = await packageCurrentProject('p');
      assert.deepEqual((packaged.doc.drafts ?? []).filter((d) => d.viewId.startsWith('joinery:')), []);
      const text = [...packaged.files.values()].map((f) => new TextDecoder().decode(f as Uint8Array)).join('\n');
      assert.ok(!text.includes('joinery:w1:front'), 'no file of the package names the working copy');
      assert.equal(packaged.doc.joineryTypes?.find((t) => t.id === W1)?.view?.drafts?.front?.length, 1, 'the type carries the line');
    } finally {
      close();
    }
  });
});
