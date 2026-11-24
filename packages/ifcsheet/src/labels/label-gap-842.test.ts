/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842, third part: "A bit more space between label and element ... I used 4 mm. A gap setting on the label type would
 * let each office choose." A label type's gap (paper millimetres) is the clear space its labels keep from their element,
 * from each other and from what they avoid; without one they keep today's 1.5 mm from the element and 0.75 mm from the rest.
 * The layout the app's LABELALL uses, the engine's TAGALL and the reader `ifcsheet build --project` uses are covered here.
 */

import { describe, expect, it } from 'vitest';
import { annotationRects } from '../dimall/annotation-rects.js';
import { tableMeasure } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { textBoxOf } from '../text-leader.js';
import { tagAllDrafts } from '../tagall/plan.js';
import { MARK_TYPE_ID, ROOM_TYPE_ID, TAGALL_TYPES } from '../tagall/types.js';
import { rectAround, rectRingGap, type Rect } from './label-geometry.js';
import { LABEL_CLEAR_MM, LABEL_GAP_MM, labelSpacing, layoutLabels, type LayoutElement } from './label-layout.js';
import type { LabelElement } from './label-resolve.js';
import { projectTagAllTypes, readLabelSpec } from './label-spec-read.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** The clear distance between two boxes: 0 when they touch or overlap. */
const apart = (a: Rect, b: Rect): number => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
const closest = (rects: readonly Rect[]): number => Math.min(...rects.flatMap((a, i) => rects.slice(i + 1).map((b) => apart(a, b))));

/** 1:100: a paper millimetre is 0.1 m. */
const UNIT = 0.1;
/** A row of small signs 0.8 m apart (8 mm on paper), each labelled with a 6 by 3.5 mm box, as the reporter's plans of IfcSign. */
const SIGNS: LayoutElement[] = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, ring: box(i * 0.8, 0, i * 0.8 + 0.2, 0.2) }));
const W = 0.6, H = 0.35;
const place = (gapMm?: number) => {
  const out = layoutLabels(SIGNS.map((s) => ({ id: s.id, ring: s.ring, w: W, h: H })), { elements: SIGNS, annotations: [], paperUnit: UNIT, ...(gapMm === undefined ? {} : { gapMm }) });
  return SIGNS.map((s) => ({ sign: s, rect: rectAround(out.get(s.id)!.centre, W, H), free: out.get(s.id)!.free }));
};

describe('a label type\'s gap in the layout LABELALL uses (#842)', () => {
  it('with the standard spacing, neighbouring labels sit closer than 4 mm', () => {
    expect(closest(place().map((p) => p.rect)) / UNIT).toBeLessThan(4);
  });

  it('with a gap of 4 mm, neighbouring labels are at least 4 mm apart and 4 mm from their sign', () => {
    const placed = place(4);
    for (const p of placed) {
      expect(p.free, p.sign.id).toBe(true);
      expect(rectRingGap(p.rect, p.sign.ring) / UNIT, p.sign.id).toBeGreaterThanOrEqual(4 - 1e-9);
    }
    expect(closest(placed.map((p) => p.rect)) / UNIT).toBeGreaterThanOrEqual(4 - 1e-9);
  });

  it('the standard gap places every label where no gap does: today\'s spacing is unchanged', () => {
    expect(place(LABEL_GAP_MM)).toEqual(place());
    expect(labelSpacing()).toEqual({ gap: LABEL_GAP_MM, clear: LABEL_CLEAR_MM });
  });
});

// TAGALL: windows in a row, read by the door and window mark type.
const measure = { ...tableMeasure, frame: { up: 1 as const, right: 1 as const } };
const window = (tag: string): LabelElement => ({
  attribute: (name) => (name === 'Mark' || name === 'Tag' ? tag : ''), className: () => 'IfcWindow', typeName: () => '', propertySets: () => [], quantitySets: () => [],
  typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
});
const WINDOWS = [0, 1, 2, 3].map((i) => ({ guid: `w${i}`, renderId: i + 1, ring: box(i * 1.0, 0, i * 1.0 + 0.9, 0.2) }));
const marks = (gap?: number) => {
  const [mark, room] = TAGALL_TYPES;
  let n = 0;
  const { drafts } = tagAllDrafts({
    elements: WINDOWS.map((w) => ({ renderId: w.renderId, anchor: { x: w.ring[0].x + 0.45, y: 0.1 }, ring: w.ring })),
    targets: WINDOWS.map((w) => ({ guid: w.guid, className: 'IfcWindow', anchor: { x: w.ring[0].x + 0.45, y: 0.1 }, renderId: w.renderId, ring: w.ring })),
    rooms: [], existing: [],
    placement: { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: UNIT, locale: 'en' },
    types: { mark: { ...mark!, label: { ...mark!.label!, ...(gap === undefined ? {} : { gap }) } }, room: room! },
    env: { read: (guid) => window(`W${guid.slice(1)}`), up: 1, styled: () => ({}), newId: () => `t${++n}` },
    reader: { sectionLink: () => null, measure }, rectsOf: annotationRects(measure), parts: { doors: false, windows: true, rooms: false },
  });
  return drafts;
};
/** The box of a mark's text and frame, its leader left out. */
const boxOf = (d: DraftEntity): Rect => {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, 1);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};

describe('the mark type\'s gap in the engine\'s TAGALL (#842)', () => {
  it('by default the marks of neighbouring windows sit closer than 4 mm', () => {
    const drafts = marks();
    expect(drafts).toHaveLength(WINDOWS.length);
    expect(closest(drafts.map(boxOf)) / UNIT).toBeLessThan(4);
  });

  it('with a gap of 4 mm they are at least 4 mm apart, and 4 mm from their window', () => {
    const drafts = marks(4);
    expect(drafts).toHaveLength(WINDOWS.length);
    expect(closest(drafts.map(boxOf)) / UNIT).toBeGreaterThanOrEqual(4 - 1e-6);
    for (const d of drafts) {
      const w = WINDOWS.find((x) => x.guid === d.params.labelOf)!;
      expect(rectRingGap(boxOf(d), w.ring) / UNIT, w.guid).toBeGreaterThanOrEqual(4 - 1e-6);
    }
  });

  it('the standard gap places the marks where no gap does', () => {
    expect(marks(LABEL_GAP_MM)).toEqual(marks());
  });
});

describe('the gap as a project file keeps it (#842)', () => {
  it('reads a gap from 0 to 20 mm and leaves out anything else', () => {
    expect(readLabelSpec({ template: '{Tag}', missing: 'empty', gap: 4 })).toEqual({ template: '{Tag}', missing: 'empty', gap: 4 });
    expect(readLabelSpec({ template: '{Tag}', missing: 'empty', gap: 0 })?.gap).toBe(0);
    for (const gap of [-1, 21, '4', Number.NaN, null]) expect(readLabelSpec({ template: '{Tag}', missing: 'empty', gap }), String(gap)).not.toHaveProperty('gap');
  });

  it('TAGALL in `ifcsheet build --project` takes the project\'s mark and room types, their gap with them', () => {
    const [mark, room] = TAGALL_TYPES;
    const types = projectTagAllTypes([{ id: MARK_TYPE_ID, name: 'Mark', tool: 'label', label: { ...mark!.label, gap: 4 } }, { id: 'other', label: { template: 'x', gap: 9 } }]);
    expect(types.mark.label?.gap).toBe(4);
    expect(types.room).toEqual(room);
    expect(types.room.id).toBe(ROOM_TYPE_ID);
    expect(projectTagAllTypes(undefined)).toEqual({ mark, room });
  });
});
