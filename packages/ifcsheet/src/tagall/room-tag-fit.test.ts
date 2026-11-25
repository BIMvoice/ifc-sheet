/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room too small for its tag, walled in by the cut (a WC, a shaft). Measured after PR #902: 124 room tags of four models
 * still lay over the cut, 92 of the school's 120 in rooms the tag does not fit at all. TAGALL now tags such a room compact
 * inside (its number and area, else its number), else beside it with a leader into it, else as before.
 */

import { describe, expect, it } from 'vitest';
import { annotationRects } from '../dimall/annotation-rects.js';
import { tableMeasure } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { rectHitsRing, type Rect } from '../labels/label-geometry.js';
import type { LabelElement } from '../labels/label-resolve.js';
import type { ViewElement } from '../labels/view-elements.js';
import { roomNumberOf } from '../labels/room-number.js';
import { textBoxOf } from '../text-leader.js';
import { tagAllDrafts } from './plan.js';
import { ROOM_TYPE_ID, TAGALL_TYPES } from './types.js';

const measure = { ...tableMeasure, frame: { up: 1 as const, right: 1 as const } };
const rectsOf = annotationRects(measure);

// Read as the app's and the headless element readers read a space (`RoomNumber`: `roomNumberOf`).
const space = (name: string, longName: string): LabelElement => ({
  attribute: (a) => ({ Name: name, LongName: longName, RoomNumber: roomNumberOf(name, longName), TagName: longName || name } as Record<string, string>)[a] ?? '', className: () => 'IfcSpace', typeName: () => '', propertySets: () => [], quantitySets: () => [],
  typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
});
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** A `w` by `h` room at the origin, walled by four 0.2 m walls the plan cuts, in a floor 8 m across (two columns at its corners: a wall of a view this small would be taken for a backdrop). */
function run(w: number, h: number, el: LabelElement) {
  const t = 0.2;
  const walls = [rect(-t, -t, w + t, 0), rect(-t, h, w + t, h + t), rect(-t, 0, 0, h), rect(w, 0, w + t, h)];
  const columns = [rect(-4, -4, -3.7, -3.7), rect(3.7, 3.7, 4, 4)];
  const elements: ViewElement[] = [...walls, ...columns].map((ring, i) => ({ renderId: i + 10, anchor: ring[0]!, ring, cut: true }));
  const [mark, roomType] = TAGALL_TYPES;
  let n = 0;
  const out = tagAllDrafts({
    elements, targets: [], rooms: [{ ring: rect(0, 0, w, h), at: 'cut', renderId: 1, guid: 'g' }], existing: [],
    placement: { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: 0.01, locale: 'en' },
    types: { mark: mark!, room: roomType! }, env: { read: () => el, up: 1, styled: () => ({}), newId: () => `t${++n}` },
    reader: { sectionLink: () => null, measure }, rectsOf, parts: { doors: false, windows: false, rooms: true },
  });
  const tag = out.drafts.find((d) => d.params.atype === ROOM_TYPE_ID)!;
  return { ...out, tag, walls };
}

const boxOf = (d: DraftEntity): Rect => {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, 1);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};
const overWalls = (r: ReturnType<typeof run>) => r.walls.some((ring) => rectHitsRing(boxOf(r.tag), ring));
const text = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.text : '');
const leader = (d: DraftEntity) => (d.shape.type === 'text' ? d.shape.leader : undefined);

describe('a room too small for its tag, walled in by the cut', () => {
  it('a WC 1.4 m by 0.7 m is tagged with its number and area, without its name, inside and off the walls', () => {
    const r = run(1.4, 0.7, space('12', 'WC Personal'));
    expect(text(r.tag)).not.toContain('WC');
    expect(text(r.tag)).toContain('12');
    expect(r.tag.params.compact).toBeDefined();
    expect(leader(r.tag)).toBeUndefined();
    expect(overWalls(r)).toBe(false);
    expect(r.summary).toMatchObject({ rooms: 1, roomsCompact: 1, roomsTooSmall: 0 });
  });

  it('a shaft 0.25 m square, too small even for its number, takes its whole tag just outside, with a leader into it', () => {
    const r = run(0.25, 0.25, space('13', 'Schacht'));
    expect(text(r.tag)).toContain('Schacht');
    const tip = leader(r.tag);
    expect(tip, 'a leader into the shaft').toBeDefined();
    expect(tip!.x > 0 && tip!.x < 0.25 && tip!.y > 0 && tip!.y < 0.25).toBe(true);
    expect(overWalls(r)).toBe(false);
    expect(r.summary).toMatchObject({ rooms: 1, roomsLeader: 1 });
  });

  it('a room with no number to show is never cut down to its area alone: it goes beside the room whole', () => {
    const r = run(1.4, 0.7, space('Abstellraum', ''));
    expect(text(r.tag)).toContain('Abstellraum');
    expect(r.tag.params.compact).toBeUndefined();
    expect(overWalls(r)).toBe(false);
  });
});
