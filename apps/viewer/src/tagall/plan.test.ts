/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** TAGALL's planner: marks from the model, a number where it has none, rooms named and sized in their middle. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject } from '@/project/project-store';
import { pointInRing, rectAround, rectInsideRing } from '@/labels/label-geometry.js';
import { wall } from '@/labels/label-fixture.js';
import { textBlock } from '@/drafting/text-block.js';
import { settleLabels } from '@/labels/label-sync.js';
import type { LabelElement } from '@/labels/label-resolve.js';
import type { LabelTarget } from '@/labels/label-place.js';
import type { ViewElement } from '@/labels/view-elements.js';
import type { DraftEntity, Pt } from '@/drafting/types';
import { markOf } from '@/labels/label-element.js';
import { planTagAll } from './plan.js';
import { TAGALL_TYPES } from './types.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const L: Pt[] = [{ x: 1, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 11 }, { x: 1, y: 11 }];
const [mark, room] = TAGALL_TYPES;

/** A door or window element: class and the attributes it has. */
const opening = (className: string, attrs: Record<string, string>): LabelElement => wall({ className: () => className, attribute: (n) => (n === 'Mark' ? markOf(attrs.Tag ?? '') : attrs[n] ?? ''), propertySets: () => [], quantitySets: () => [], typePropertySets: () => [] });
const space = (attrs: Record<string, string>, area?: number): LabelElement => wall({ className: () => 'IfcSpace', attribute: (n) => attrs[n] ?? '', propertySets: () => [], typePropertySets: () => [], quantitySets: () => (area === undefined ? [] : [{ name: 'Qto_SpaceBaseQuantities', quantities: [{ name: 'NetFloorArea', value: area }] }]) });

const model: Record<string, LabelElement> = {
  D1: opening('IfcDoor', { Tag: 'D-01', Name: 'Door 1' }),
  D2: opening('IfcDoor', { Name: 'Haustuer' }),
  W1: opening('IfcWindow', { Tag: 'E605AACB-6C4E-458D-93-46-5D9D8C7C21D3' }),
  W2: opening('IfcWindow', {}),
  R1: space({ Name: '4', LongName: 'Schlafzimmer' }, 12.5),
  R2: space({ Name: '5', LongName: 'Flur' }),
};
const read = (guid: string) => model[guid] ?? null;

const els: ViewElement[] = [
  { renderId: 1, anchor: { x: 5, y: 0.5 }, ring: box(4.5, 0.2, 5.5, 0.8) },
  { renderId: 2, anchor: { x: 7, y: 0.5 }, ring: box(6.5, 0.2, 7.5, 0.8) },
  { renderId: 3, anchor: { x: 9, y: 0.5 }, ring: box(8.5, 0.2, 9.5, 0.8) },
  { renderId: 4, anchor: { x: 2, y: 0.5 }, ring: box(1.5, 0.2, 2.5, 0.8) },
];
const targets: LabelTarget[] = [
  { guid: 'D1', className: 'IfcDoor', anchor: els[0].anchor, renderId: 1, ring: els[0].ring },
  { guid: 'D2', className: 'IfcDoor', anchor: els[1].anchor, renderId: 2, ring: els[1].ring },
  { guid: 'W1', className: 'IfcWindow', anchor: els[2].anchor, renderId: 3, ring: els[2].ring },
  { guid: 'W2', className: 'IfcWindow', anchor: els[3].anchor, renderId: 4, ring: els[3].ring },
];
const placement = { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: 0.1 };
const rooms = [{ renderId: 10, guid: 'R1', ring: L, at: 'cut' as const }, { renderId: 11, guid: 'R2', ring: box(12, 1, 15, 4), at: 'cut' as const }];
const run = (existing: DraftEntity[] = [], over: Partial<Parameters<typeof planTagAll>[0]> = {}) => planTagAll({ elements: els, targets, rooms, existing, placement, types: { mark, room }, read, ...over });
const text = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text : '');
const byGuid = (drafts: DraftEntity[], guid: string) => drafts.find((d) => d.params.labelOf === guid)!;

beforeEach(() => resetProject());

describe('TAGALL marks', () => {
  it('shows the model\'s short mark, else the code of the kind: windows of one kind share W1, a door gets D1', () => {
    const { drafts, summary } = run();
    assert.equal(text(byGuid(drafts, 'D1')), 'D-01');
    assert.equal(text(byGuid(drafts, 'D2')), 'D1');
    assert.equal(text(byGuid(drafts, 'W1')), 'W1');
    assert.equal(text(byGuid(drafts, 'W2')), 'W1');
    assert.equal(summary.marks, 4);
    assert.equal(summary.coded, 3);
    assert.equal(summary.kinds, 2);
  });
  it('draws a mark as a small bubble with no leader, beside the element', () => {
    for (const d of run().drafts.filter((x) => x.params.atype === mark.id)) {
      assert.ok(d.shape.type === 'text');
      assert.equal(d.shape.frame, 'bubble');
      assert.equal(d.shape.leader, undefined);
    }
  });
  it('puts a window mark on the outside of the wall and a door mark on the room side', () => {
    // A wall along y = 0 with the building above it (the middle of the view is at +y): outside is -y.
    const wallEl: ViewElement = { renderId: 20, anchor: { x: 8, y: 0.5 }, ring: box(0, 0.2, 16, 0.8) };
    const sill: ViewElement = { renderId: 21, anchor: { x: 8, y: 9 }, ring: box(0, 8.8, 16, 9.4) };
    const both = { elements: [wallEl, sill, ...els], targets: targets.filter((t) => t.guid === 'D2' || t.guid === 'W2'), rooms: [] };
    const out = run([], both).drafts;
    const y = (guid: string) => (byGuid(out, guid).shape as { p: Pt }).p.y;
    assert.ok(y('W2') < 0.2, 'the window mark is outside the wall');
    assert.ok(y('D2') > 0.8, 'the door mark is on the room side');
  });
  it('keeps a mark off what the plan draws over its cut', () => {
    const free = (byGuid(run().drafts, 'W2').shape as { p: Pt }).p;
    // A door swing drawn exactly there.
    const drawn = [{ kind: 'cut' as const, a: { x: free.x - 0.5, y: free.y }, b: { x: free.x + 0.5, y: free.y } }];
    const moved = (byGuid(run([], { obstacles: { drawn, linework: [] } }).drafts, 'W2').shape as { p: Pt }).p;
    assert.notDeepEqual(moved, free);
  });
  it('does not take a unique id for a mark', () => {
    assert.equal(markOf('E605AACB-6C4E-458D-93-46-5D9D8C7C21D3'), '');
    assert.equal(markOf('2FxDW7j3aRrZeBqKv1jFaU'), '');
    assert.equal(markOf('D-01'), 'D-01');
    assert.equal(markOf('W12'), 'W12');
    assert.equal(markOf('F-2024-17-3'), 'F-2024-17-3');
  });
  it('is the same every time', () => assert.deepEqual(run().drafts.map(text), run().drafts.map(text)));
  it('adds only what is missing the second time, and a kind keeps its code', () => {
    const first = run().drafts;
    const again = run(first);
    assert.equal(again.drafts.length, 0);
    assert.equal(again.summary.already, 6);
    // A window of another kind appears later (a wider one): it takes the next code, the others keep theirs.
    model.W3 = opening('IfcWindow', {});
    const extra: LabelTarget = { guid: 'W3', className: 'IfcWindow', anchor: { x: 12, y: 0.5 }, renderId: 5, ring: box(11.5, 0.2, 13.5, 0.8) };
    const known = new Map(first.flatMap((d): [string, string][] => (typeof d.params.markKey === 'string' ? [[d.params.markKey, String(d.params.markCode)]] : [])));
    const third = run(first, { targets: [...targets, extra], elements: [...els, { renderId: 5, anchor: extra.anchor, ring: extra.ring }], knownCodes: known });
    delete model.W3;
    assert.deepEqual(third.drafts.map(text), ['W2']);
  });
  it('keeps clear of annotation already on the view', () => {
    const free = run().drafts.find((d) => d.params.labelOf === 'D1')!;
    const b = textBlock('D-01', 0.25, 'box').outer;
    // Put a note exactly where the first mark would go.
    const note: DraftEntity = { ...free, id: 'note', params: {} };
    const moved = run([note]).drafts.find((d) => d.params.labelOf === 'D1')!;
    assert.notDeepEqual((moved.shape as { p: Pt }).p, (free.shape as { p: Pt }).p);
    assert.ok(b.x1 > 0);
  });
  it('a mark follows the model: a short Tag added later replaces the code', () => {
    const win = byGuid(run().drafts, 'W1');
    assert.equal(win.params.markCode, 'W1');
    const tagged = settleLabels([win], [mark], () => opening('IfcWindow', { Tag: 'F-9' }));
    assert.equal(text(tagged[0]), 'F-9');
    const still = settleLabels([win], [mark], () => opening('IfcWindow', { Tag: 'A tag that is far too long for a plan' }));
    assert.equal(text(still[0]), 'W1');
  });
});

describe('TAGALL rooms', () => {
  it('names each room and gives its area, in the middle of the room, inside it', () => {
    const { drafts } = run();
    const l = byGuid(drafts, 'R1');
    assert.equal(text(l), 'SCHLAFZIMMER\n12.50 m²');
    const w = 0.25;
    const b = textBlock(text(l), w).outer;
    assert.ok(l.shape.type === 'text');
    const at = l.shape.p;
    const centre = { x: at.x + (b.x1 - b.x0) / 2, y: at.y };
    assert.ok(pointInRing(L, centre), `${JSON.stringify(centre)} is in the L`);
    assert.ok(rectInsideRing(rectAround(centre, b.x1 - b.x0, 0.3), L));
  });
  it('takes the area from the model when it has one, else from the footprint, and says which', () => {
    const { drafts, summary } = run();
    assert.equal(summary.areaFromModel, 1);
    assert.equal(summary.areaFromFootprint, 1);
    // The second room is 3 x 3 m.
    assert.equal(text(byGuid(drafts, 'R2')), 'FLUR\n9.00 m²');
    assert.equal(byGuid(drafts, 'R2').params.computedArea, 9);
    assert.equal(byGuid(drafts, 'R1').params.computedArea, undefined);
  });
  it('a room follows the model: the area quantity wins over the footprint once the model has it', () => {
    const r2 = byGuid(run().drafts, 'R2');
    const later = settleLabels([r2], [room], () => space({ Name: '5', LongName: 'Flur' }, 8.2));
    assert.equal(text(later[0]), 'FLUR\n8.20 m²');
  });
  it('is not labelled twice, and its label is not put over the marks', () => {
    const first = run().drafts;
    assert.equal(run(first).drafts.length, 0);
  });
  it('says so when the plan shows no room', () => {
    const { drafts, summary } = run([], { rooms: [] });
    assert.equal(summary.noRooms, true);
    assert.equal(summary.rooms, 0);
    assert.equal(drafts.length, 4);
  });
  it('says when a label is bigger than its room, and puts it beside the room with a leader', () => {
    const tiny = box(0, 3, 0.5, 3.5);
    const { summary, drafts } = run([], { rooms: [{ renderId: 10, guid: 'R2', ring: tiny, at: 'cut' }] });
    assert.equal(summary.roomsTooSmall, 1);
    const l = byGuid(drafts, 'R2');
    assert.ok(l.shape.type === 'text' && l.shape.leader !== undefined, 'the label is joined to its room');
  });
});


describe('TAGALL on a detail', () => {
  // The detail shows x 0..6, y 0..6 of a plan that holds more.
  const crop = { min: { x: 0, y: 0 }, max: { x: 6, y: 6 } };
  const shown = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.p : null)!;
  const inCrop = (p: Pt) => p.x >= crop.min.x && p.x <= crop.max.x && p.y >= crop.min.y && p.y <= crop.max.y;

  it('labels the rooms inside the crop and none outside it', () => {
    // R1 is the L (it runs into the crop), R2 stands at x 12..15, far outside.
    const { drafts, summary } = run([], { crop, targets: targets.slice(0, 1), elements: els.slice(0, 1) });
    assert.ok(drafts.some((d) => d.params.labelOf === 'R1'), 'the room in the crop is labelled');
    assert.ok(!drafts.some((d) => d.params.labelOf === 'R2'), 'the room outside the crop is not');
    assert.equal(summary.rooms, 1);
    assert.ok(drafts.every((d) => inCrop(shown(d))), 'every label stands inside the crop');
  });

  it('puts the label of a room the crop cuts inside the crop, and keeps the whole room\'s area', () => {
    const wide = [{ renderId: 12, guid: 'R2', ring: box(2, 1, 10, 5), at: 'cut' as const }];
    const { drafts } = run([], { crop, rooms: wide, targets: [], elements: [] });
    const l = byGuid(drafts, 'R2');
    assert.ok(inCrop(shown(l)), JSON.stringify(shown(l)));
    // 8 x 4 m, not the 4 x 4 m the crop shows of it.
    assert.equal(l.params.computedArea, 32);
    assert.equal(text(l), 'FLUR\n32.00 m²');
  });

  it('says the detail shows no room when none reaches it', () => {
    const { drafts, summary } = run([], { crop: { min: { x: 20, y: 20 }, max: { x: 22, y: 22 } }, targets: [], elements: [] });
    assert.equal(summary.noRooms, true);
    assert.equal(drafts.length, 0);
  });

  it('does not make a mark whose place falls outside the crop', () => {
    const { drafts } = run([], { crop: { min: { x: 4.4, y: 0.1 }, max: { x: 5.6, y: 0.9 } }, rooms: [], targets: targets.slice(0, 1), elements: els.slice(0, 1) });
    assert.equal(drafts.length, 0);
  });
});
