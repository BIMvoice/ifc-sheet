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
  it('shows the Tag, else the Name, else a running number the tool counts', () => {
    const { drafts, summary } = run();
    assert.equal(text(byGuid(drafts, 'D1')), 'D-01');
    assert.equal(text(byGuid(drafts, 'D2')), 'Haustuer');
    assert.equal(text(byGuid(drafts, 'W1')), '1');
    assert.equal(text(byGuid(drafts, 'W2')), '2');
    assert.equal(summary.marks, 4);
    assert.equal(summary.numbered, 2);
  });
  it('does not take a unique id for a mark', () => {
    assert.equal(markOf('E605AACB-6C4E-458D-93-46-5D9D8C7C21D3'), '');
    assert.equal(markOf('2FxDW7j3aRrZeBqKv1jFaU'), '');
    assert.equal(markOf('D-01'), 'D-01');
    assert.equal(markOf('W12'), 'W12');
    assert.equal(markOf('F-2024-17-3'), 'F-2024-17-3');
  });
  it('is the same every time', () => assert.deepEqual(run().drafts.map(text), run().drafts.map(text)));
  it('adds only what is missing the second time, and numbers on from the first run', () => {
    const first = run().drafts;
    const again = run(first);
    assert.equal(again.drafts.length, 0);
    assert.equal(again.summary.already, 6);
    // A window the model gave no mark to appears later: it takes the next number.
    model.W3 = opening('IfcWindow', {});
    const extra: LabelTarget = { guid: 'W3', className: 'IfcWindow', anchor: { x: 12, y: 0.5 }, renderId: 5, ring: box(11.5, 0.2, 12.5, 0.8) };
    const third = run(first, { targets: [...targets, extra], elements: [...els, { renderId: 5, anchor: extra.anchor, ring: extra.ring }] });
    delete model.W3;
    assert.deepEqual(third.drafts.map(text), ['3']);
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
  it('a mark follows the model: a Tag added later replaces the number', () => {
    const { drafts } = run();
    const win = byGuid(drafts, 'W1');
    assert.equal(win.params.numbered, 1);
    const tagged = settleLabels([win], [mark], () => opening('IfcWindow', { Tag: 'F-9' }));
    assert.equal(text(tagged[0]), 'F-9');
    const still = settleLabels([win], [mark], () => opening('IfcWindow', {}));
    assert.equal(text(still[0]), '1');
  });
});

describe('TAGALL rooms', () => {
  it('names each room and gives its area, in the middle of the room, inside it', () => {
    const { drafts } = run();
    const l = byGuid(drafts, 'R1');
    assert.equal(text(l), 'Schlafzimmer\n12.50 m²');
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
    assert.equal(text(byGuid(drafts, 'R2')), 'Flur\n9.00 m²');
    assert.equal(byGuid(drafts, 'R2').params.computedArea, 9);
    assert.equal(byGuid(drafts, 'R1').params.computedArea, undefined);
  });
  it('a room follows the model: the area quantity wins over the footprint once the model has it', () => {
    const r2 = byGuid(run().drafts, 'R2');
    const later = settleLabels([r2], [room], () => space({ Name: '5', LongName: 'Flur' }, 8.2));
    assert.equal(text(later[0]), 'Flur\n8.20 m²');
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
  it('says when a label is bigger than its room', () => {
    const { summary } = run([], { rooms: [{ renderId: 10, guid: 'R2', ring: box(0, 0, 0.5, 0.5), at: 'cut' }] });
    assert.equal(summary.roomsTooSmall, 1);
  });
});

