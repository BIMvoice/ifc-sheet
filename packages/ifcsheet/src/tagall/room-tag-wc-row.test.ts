/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A row of WCs at 1:200, each too small for its tag even cut down, as the school (ISSUE_068) has them: after #904 the
 * tags of WC 01094 and 01095 lay over each other and over the wall between them, and the leader of 01011 ran 24.5 mm
 * across a wall and a door tag. TAGALL now keeps every room tag off the others and off the cut, and a leader at most
 * 12 mm long on paper that crosses no wall but the one it enters its room through.
 */

import { describe, expect, it } from 'vitest';
import { annotationRects } from '../dimall/annotation-rects.js';
import { tableMeasure } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { nearestOnRing, rectHitsRing, rectsOverlap, type Rect } from '../labels/label-geometry.js';
import type { LabelElement } from '../labels/label-resolve.js';
import type { ViewElement } from '../labels/view-elements.js';
import { roomNumberOf } from '../labels/room-number.js';
import { textBoxOf, textLeaderOf } from '../text-leader.js';
import { tagAllDrafts } from './plan.js';
import { ROOM_LEADER_MAX_MM } from './room-fit.js';
import { crossing, ENTRY_BAND } from './room-outside.js';
import { ROOM_TYPE_ID, TAGALL_TYPES } from './types.js';

const measure = { ...tableMeasure, frame: { up: 1 as const, right: 1 as const } };
const rectsOf = annotationRects(measure);
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const space = (name: string, longName: string): LabelElement => ({
  attribute: (a) => ({ Name: name, LongName: longName, RoomNumber: roomNumberOf(name, longName), TagName: longName || name } as Record<string, string>)[a] ?? '', className: () => 'IfcSpace', typeName: () => '', propertySets: () => [], quantitySets: () => [],
  typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
});

/** 1:200: a 2.5 mm text is 0.5 m, a paper millimetre 0.2 m. */
const SCALE = 0.2;
const T = 0.2;

/**
 * `n` WCs 1.4 m by 1.4 m side by side, 0.2 m walls between them and round them, in front of them a corridor 1.2 m wide (too
 * narrow for a whole tag at 1:200) that runs 2 m past each end of the row, walled all round; the floor 12 m across (two
 * columns at its corners).
 */
function wcRow(n: number) {
  const w = 1.4, pitch = w + T, len = n * pitch + T;
  const row = [rect(0, -T, len, 0), rect(0, w, len, w + T), ...Array.from({ length: n + 1 }, (_, i) => rect(i * pitch, 0, i * pitch + T, w))];
  const y0 = -1.2 - 2 * T, y1 = w + 2 * T;
  const corridor = [rect(-2, y0, len + 2, y0 + T), rect(-2, y1 - T, len + 2, y1), rect(-2 - T, y0, -2, y1), rect(len + 2, y0, len + 2 + T, y1)];
  const walls = [...row, ...corridor];
  const columns = [rect(-6, -6, -5.7, -5.7), rect(5.7 + len, 5.7, 6 + len, 6)];
  const elements: ViewElement[] = [...walls, ...columns].map((ring, i) => ({ renderId: i + 10, anchor: ring[0]!, ring, cut: true }));
  const rooms = Array.from({ length: n }, (_, i) => ({ ring: rect(i * pitch + T, 0, i * pitch + T + w, w), at: 'cut' as const, renderId: i + 1, guid: `wc${i}` }));
  const [mark, roomType] = TAGALL_TYPES;
  let k = 0;
  const out = tagAllDrafts({
    elements, targets: [], rooms, existing: [],
    placement: { viewId: 'v', layerId: 'l', textHeight: 2.5 * SCALE, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: SCALE, locale: 'en' },
    types: { mark: mark!, room: roomType! }, env: { read: (guid) => space(`0109${guid.slice(2)}`, 'wc'), up: 1, styled: () => ({}), newId: () => `t${++k}` },
    reader: { sectionLink: () => null, measure }, rectsOf, parts: { doors: false, windows: false, rooms: true },
  });
  const tags = out.drafts.filter((d) => d.params.atype === ROOM_TYPE_ID);
  return { tags, walls, rooms };
}

const boxOf = (d: DraftEntity): Rect => {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, 1);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};
const name = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text.split('\n')[0] : d.id);

describe('a row of WCs too small for their tags (#904 follow-up, ISSUE_068 WCs 01094 and 01095)', () => {
  for (const n of [2, 3]) it(`${n} WCs side by side: every one tagged, no tag over another or over a wall, every leader short and crossing no other wall`, () => {
    const { tags, walls, rooms } = wcRow(n);
    expect(tags).toHaveLength(n);
    const problems: string[] = [];
    tags.forEach((a, i) => {
      for (const b of tags.slice(i + 1)) if (rectsOverlap(boxOf(a), boxOf(b))) problems.push(`${name(a)} over ${name(b)}`);
      if (walls.some((ring) => rectHitsRing(boxOf(a), ring))) problems.push(`${name(a)} over a wall`);
      if (a.shape.type !== 'text') return;
      const l = textLeaderOf(a.shape, 1);
      if (!l) return;
      const length = Math.hypot(l.tip.x - l.from.x, l.tip.y - l.from.y) / SCALE;
      if (length > ROOM_LEADER_MAX_MM) problems.push(`${name(a)} leader ${length.toFixed(1)} mm`);
      const room = rooms.find((r) => r.guid === a.params.labelOf)!.ring;
      for (const ring of walls) for (let j = 0; j < ring.length; j++) {
        const at = crossing(l.from, l.tip, ring[j]!, ring[(j + 1) % ring.length]!);
        const near = at ? nearestOnRing(room, at) : null;
        if (at && near && Math.hypot(near.x - at.x, near.y - at.y) > ENTRY_BAND) problems.push(`${name(a)} leader crosses a wall it does not enter by`);
      }
    });
    expect(problems).toEqual([]);
  });
});
