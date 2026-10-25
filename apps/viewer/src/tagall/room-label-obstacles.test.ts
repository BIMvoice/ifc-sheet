/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #42: a room's label shows its number, name and area, and keeps clear of the symbols the plan draws (door swings, window frames). */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject } from '@/project/project-store';
import { wall } from '@/labels/label-fixture.js';
import { textBox } from '@/drafting/annotation';
import type { LabelElement } from '@/labels/label-resolve.js';
import type { DraftEntity, Pt } from '@/drafting/types';
import type { ViewElement } from '@/labels/view-elements.js';
import type { LabelTarget } from '@/labels/label-place.js';
import { planTagAll } from './plan.js';
import { TAGALL_TYPES } from './types.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const [mark, room] = TAGALL_TYPES;
const space = (attrs: Record<string, string>, area: number): LabelElement => wall({
  className: () => 'IfcSpace',
  // The number is the Name when a LongName names the room (what `labelElementOf` reads).
  attribute: (n) => (n === 'RoomNumber' ? (attrs.LongName ? attrs.Name ?? '' : '') : attrs[n] ?? ''),
  propertySets: () => [], typePropertySets: () => [],
  quantitySets: () => [{ name: 'Qto_SpaceBaseQuantities', quantities: [{ name: 'NetFloorArea', value: area }] }],
});
const model: Record<string, LabelElement> = {
  A: space({ Name: '4', LongName: 'Schlafzimmer' }, 12.5),
  B: space({ Name: 'Hall' }, 30),
};
const read = (guid: string) => model[guid] ?? null;
const placement = { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: 0.1, locale: 'en' };
const ROOM_A = { renderId: 10, guid: 'A', ring: box(0, 0, 8, 5), at: 'cut' as const };
const run = (over: Partial<Parameters<typeof planTagAll>[0]> = {}, rooms = [ROOM_A]) => planTagAll({ elements: [], targets: [], rooms, existing: [], placement, types: { mark, room }, read, ...over });
const labelBox = (d: DraftEntity): Pt[] => {
  assert.equal(d.shape.type, 'text');
  const sh = d.shape as { p: Pt; text: string; height: number };
  return textBox(sh.p, sh.text, sh.height, 0);
};
const overlap = (a: Pt[], b: { x0: number; y0: number; x1: number; y1: number }): boolean =>
  Math.min(...a.map((p) => p.x)) < b.x1 && Math.max(...a.map((p) => p.x)) > b.x0 && Math.min(...a.map((p) => p.y)) < b.y1 && Math.max(...a.map((p) => p.y)) > b.y0;

beforeEach(() => resetProject());

describe('the room label (#42)', () => {
  it('says the number, the name and the area; a room with no number has no empty first line', () => {
    const { drafts } = run({}, [ROOM_A, { renderId: 11, guid: 'B', ring: box(10, 0, 16, 5), at: 'cut' as const }]);
    const texts = drafts.map((d) => (d.shape as { text: string }).text);
    assert.deepEqual(texts, ['4\nSchlafzimmer\n12.50 m²', 'Hall\n30.00 m²']);
  });
});

describe('the room label keeps off the symbols the plan draws (#42)', () => {
  it('moves off a door swing laid over the room\'s free middle, and stays put when the symbol is elsewhere', () => {
    const free = labelBox(run().drafts[0]);
    const cx = (Math.min(...free.map((p) => p.x)) + Math.max(...free.map((p) => p.x))) / 2;
    const cy = (Math.min(...free.map((p) => p.y)) + Math.max(...free.map((p) => p.y))) / 2;
    const swing = { x0: cx - 0.6, y0: cy - 0.6, x1: cx + 0.6, y1: cy + 0.6 };
    assert.ok(overlap(free, swing), 'the symbol lies where the label would go');
    const moved = labelBox(run({ obstacles: [swing] }).drafts[0]);
    assert.ok(!overlap(moved, swing), 'the label is clear of the swing');
    const elsewhere = labelBox(run({ obstacles: [{ x0: 40, y0: 40, x1: 41, y1: 41 }] }).drafts[0]);
    assert.deepEqual(elsewhere, free);
  });
});

const rectOf = (corners: Pt[]) => ({ x0: Math.min(...corners.map((p) => p.x)), y0: Math.min(...corners.map((p) => p.y)), x1: Math.max(...corners.map((p) => p.x)), y1: Math.max(...corners.map((p) => p.y)) });

describe('the room label keeps off the elements the plan shows in the room (#42)', () => {
  const free = labelBox(run().drafts[0]);
  const middle = rectOf(free);
  it('leaves a column or wall stub standing in the room\'s free middle, whatever its width', () => {
    const column: ViewElement = { renderId: 1, anchor: { x: 4, y: 2.5 }, ring: box(middle.x0 - 0.1, middle.y0 - 0.1, middle.x1 + 0.1, middle.y1 + 0.1) };
    const moved = labelBox(run({ elements: [column] }).drafts[0]);
    assert.ok(!overlap(moved, rectOf(column.ring)), 'the label is clear of the element');
    assert.ok(moved.every((p) => p.x > 0 && p.x < 8 && p.y > 0 && p.y < 5), 'and still in the room');
  });
  it('leaves the ground a door leaf sweeps, which the door\'s own outline does not cover', () => {
    const cx = (middle.x0 + middle.x1) / 2, cy = (middle.y0 + middle.y1) / 2;
    const door: LabelTarget = { guid: 'DOOR', className: 'IfcDoor', anchor: { x: cx, y: cy }, renderId: 2, ring: box(cx - 0.45, cy - 0.05, cx + 0.45, cy + 0.05) };
    // A door 0.9 m wide sweeps 0.9 m to each side of its outline.
    const swing = { x0: cx - 0.45, y0: cy - 0.95, x1: cx + 0.45, y1: cy + 0.95 };
    assert.ok(overlap(free, swing), 'the swing lies where the label would go');
    const moved = labelBox(run({ targets: [door] }).drafts[0]);
    assert.ok(!overlap(moved, swing), 'the label is clear of the swing');
  });
});
