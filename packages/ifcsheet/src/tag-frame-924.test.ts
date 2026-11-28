/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #924: a door's mark in a circle and a window's in a hexagon, where every mark was in a box. The label type gives a door
 * and a window their own frame; its labels carry it; the sheet the PDF, SVG and DXF are written from draws a circle round
 * the text and a closed six-sided outline; a project or a library saved before keeps drawing its box.
 */

import { describe, expect, it } from 'vitest';
import type { Point2D } from '@ifc-lite/drawing-2d';
import type { AnnotationType } from './annotation-type.js';
import type { SheetViewport } from './document.js';
import type { DraftEntity, Pt } from './draft-types.js';
import { labelDraft, type LabelEnv } from './labels/label-draft.js';
import type { LabelElement } from './labels/label-resolve.js';
import { projectTagAllTypes, readLabelSpec } from './labels/label-spec-read.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import { sheetGraphicToDxf } from './sheet-dxf.js';
import type { SheetGraphic } from './sheet-graphic.js';
import type { SheetStroke } from './sheet-stroke.js';
import { MARK_TYPE_ID, TAGALL_TYPES } from './tagall/types.js';
import { textBlock } from './text-block.js';
import { leaderStart, textLeaderOf } from './text-leader.js';

// A plan at 1:100 (a drawing metre is 10 paper mm), the drawing's origin at paper (100, 100), y up the paper.
const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
const at = (p: Pt): Point2D => ({ x: 100 + p.x * 10, y: 100 - p.y * 10 });
const print = (drafts: DraftEntity[]): SheetStroke[] => viewportAnnotations(
  { view: undefined, vp, at, frame: { kx: 1, ky: -1 }, box: null },
  { drafts, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } satisfies SheetAnnotations,
).strokes;
const sheetOf = (strokes: SheetStroke[]): SheetGraphic => ({
  sheetId: 's', number: 'A-101', name: 'Plan', paper: { w: 297, h: 210 }, frame: [], fills: [], cut: [], lines: [], pens: [], marks: [], images: [],
  underlays: [], viewports: [], symbols: { solids: [], strokes: [] }, texts: [], strokes,
});

// A door and a window whose marks the template reads; the label is centred on the origin.
const element = (className: string, tag: string): LabelElement => ({ className: () => className, attribute: (name: string) => (name === 'Tag' ? tag : '') }) as unknown as LabelElement;
const model: Record<string, LabelElement> = { door: element('IfcDoor', 'D01'), window: element('IfcWindowStandardCase', 'W01'), wall: element('IfcWall', 'X01') };
const env: LabelEnv = { read: (g) => model[g] ?? null, up: -1, styled: () => ({}), newId: () => 'n' };
const place = { viewId: 'v', layerId: 'L', textHeight: 0.25, textStyle: 's', dimStyle: 'd', paperUnit: 0.1, locale: 'en' as const };
const markType = (classFrames?: object): AnnotationType => ({ id: MARK_TYPE_ID, name: 'Mark', tool: 'label', label: { template: '{Tag}', frame: 'box', missing: 'empty', leader: 'never', ...(classFrames ? { classFrames } : {}) } });
const marked = (type: AnnotationType, guid: string): DraftEntity => labelDraft(env, type, guid, { x: 0, y: 0 }, place)!;
const ringed = markType({ IfcDoor: 'circle', IfcWindow: 'hexagon' });

/** The one stroke's one run, without its closing point. */
function outline(strokes: SheetStroke[]): Point2D[] {
  expect(strokes).toHaveLength(1);
  expect(strokes[0].runs).toHaveLength(1);
  const run = strokes[0].runs[0];
  expect(run[run.length - 1]).toEqual(run[0]);
  return run.slice(0, -1);
}

/** The paper box of a label's text, its frame left out: where its glyphs stand. */
function textBox(d: DraftEntity) {
  if (d.shape.type !== 'text') throw new Error('a text');
  const { box } = textBlock(d.shape.text, d.shape.height * 10);
  const o = at(d.shape.p);
  return { x0: o.x + box.x0, x1: o.x + box.x1, y0: o.y + box.y0, y1: o.y + box.y1 };
}

/** The vertices of each LWPOLYLINE a DXF holds and whether it is closed. */
function polylines(dxf: Uint8Array): { pts: Point2D[]; closed: boolean }[] {
  const lines = new TextDecoder('windows-1252').decode(dxf).split(/\r?\n/).map((l) => l.trim());
  const out: { pts: Point2D[]; closed: boolean }[] = [];
  let cur: { pts: Point2D[]; closed: boolean } | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, value] = [lines[i], lines[i + 1]];
    if (code === '0') cur = value === 'LWPOLYLINE' ? { pts: [], closed: false } : null, cur && out.push(cur);
    else if (cur && code === '70') cur.closed = value === '1';
    else if (cur && code === '10') cur.pts.push({ x: Number(value), y: NaN });
    else if (cur && code === '20') cur.pts[cur.pts.length - 1].y = Number(value);
  }
  return out;
}

describe('a label type frames a door\'s mark and a window\'s on their own (#924)', () => {
  it('its labels carry the door\'s circle and the window\'s hexagon; any other element the type\'s box', () => {
    expect(marked(ringed, 'door').shape).toMatchObject({ type: 'text', text: 'D01', frame: 'circle' });
    expect(marked(ringed, 'window').shape).toMatchObject({ type: 'text', text: 'W01', frame: 'hexagon' });
    expect(marked(ringed, 'wall').shape).toMatchObject({ frame: 'box' });
    expect(marked(markType({ IfcWindow: 'none' }), 'window').shape).not.toHaveProperty('frame');
  });

  it('the sheet draws a circle round the door\'s mark: one centre, one radius, every corner of the text inside', () => {
    const door = marked(ringed, 'door');
    const pts = outline(print([door]));
    const t = textBox(door);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const r = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-9);
    expect(pts.length).toBeGreaterThanOrEqual(24);
    for (const [x, y] of [[t.x0, t.y0], [t.x1, t.y0], [t.x0, t.y1], [t.x1, t.y1]]) expect(Math.hypot(x - c.x, y - c.y)).toBeLessThan(r[0]);
  });

  it('the sheet draws a closed hexagon round the window\'s mark: six corners, six equal angles, the text inside it', () => {
    const window = marked(ringed, 'window');
    const pts = outline(print([window]));
    expect(pts).toHaveLength(6);
    // Convex, every corner turning the same way by 60 degrees.
    pts.forEach((p, i) => {
      const [a, b] = [pts[(i + 1) % 6], pts[(i + 2) % 6]];
      const turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(a.y - p.y, a.x - p.x);
      expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeCloseTo(Math.PI / 3, 9);
    });
    const t = textBox(window);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThan(t.x0);
    expect(Math.max(...xs)).toBeGreaterThan(t.x1);
    expect(Math.min(...ys)).toBeLessThan(t.y0);
    expect(Math.max(...ys)).toBeGreaterThan(t.y1);
  });

  it('the DXF writes the hexagon as one closed six-vertex polyline and the circle as a closed round one, where the sheet has them', () => {
    const strokes = print([marked(ringed, 'door'), marked(ringed, 'window')]);
    const found = polylines(sheetGraphicToDxf(sheetOf(strokes)));
    expect(found.map((p) => [p.pts.length, p.closed])).toEqual([[48, true], [6, true]]);
    // Paper millimetres, y up the paper in the DXF.
    const hex = outline([strokes[1]]);
    found[1].pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(hex[i].x, 3);
      expect(p.y).toBeCloseTo(210 - hex[i].y, 3);
    });
  });

  it('a leader leaves a hexagon from its side, not from the corner of the box round it', () => {
    // A hexagon filling 4 by 2: its points at (0, 1) and (4, 1), its slanted sides 2/(2√3) in from the box's corners.
    const outer = { x0: 0, y0: 0, x1: 4, y1: 2 };
    expect(leaderStart(outer, 'hexagon', { x: 2, y: 10 })).toEqual({ x: 2, y: 2 });
    expect(leaderStart(outer, 'hexagon', { x: 10, y: 1 })).toEqual({ x: 4, y: 1 });
    const slant = leaderStart(outer, 'hexagon', { x: 10, y: 3 })!;
    // On the side from (4, 1) to (4 - 1/√3, 2), not at the box's corner (4, 2), where a box's leader starts.
    expect((slant.x - 4) * 1 - (slant.y - 1) * -(1 / Math.sqrt(3))).toBeCloseTo(0, 9);
    expect(slant.x).toBeLessThan(4);
    expect(leaderStart(outer, false, { x: 10, y: 3 })).toEqual({ x: 4, y: 2 });
    expect(leaderStart(outer, 'hexagon', { x: 3, y: 1.2 })).toBeUndefined();
  });

  it('a text framed in a circle or a hexagon carries its leader from that frame', () => {
    const shape = { type: 'text' as const, p: { x: 0, y: 0 }, text: 'W01', height: 0.25, rotation: 0, leader: { x: 0.3, y: 3 } };
    for (const frame of ['circle', 'hexagon'] as const) expect(textLeaderOf({ ...shape, frame }, -1)?.tip).toEqual(shape.leader);
  });
});

describe('a project or a library saved before #924 keeps its box', () => {
  it('a stored label without class frames reads as before, and its door and window marks are boxed', () => {
    const before = { template: '{Mark}', frame: 'box', missing: 'empty' };
    const read = readLabelSpec(before)!;
    expect(read).toEqual(before);
    const type = { ...markType(), label: read };
    expect(marked(type, 'door').shape).toMatchObject({ frame: 'box' });
    expect(marked(type, 'window').shape).toMatchObject({ frame: 'box' });
  });

  it('TAGALL\'s standard mark type and a project that never chose frame every mark in a box', () => {
    expect(TAGALL_TYPES[0].label).not.toHaveProperty('classFrames');
    const { mark } = projectTagAllTypes([{ id: MARK_TYPE_ID, label: { template: '{Mark}', frame: 'box', missing: 'empty' } }]);
    expect(mark.label).not.toHaveProperty('classFrames');
    expect(marked(mark, 'window').shape).toMatchObject({ frame: 'box' });
  });

  it('a project that chose them keeps them; a class or a frame it does not know is left out', () => {
    const { mark } = projectTagAllTypes([{ id: MARK_TYPE_ID, label: { template: '{Mark}', frame: 'box', missing: 'empty', classFrames: { IfcDoor: 'circle', IfcWindow: 'hexagon', IfcWall: 'circle', IfcSlab: 'star' } } }]);
    expect(mark.label?.classFrames).toEqual({ IfcDoor: 'circle', IfcWindow: 'hexagon' });
    expect(readLabelSpec({ template: 'x', missing: 'empty', classFrames: { IfcDoor: 'star' } })).not.toHaveProperty('classFrames');
    expect(readLabelSpec({ template: 'x', missing: 'empty', classFrames: { IfcWindow: 'none' } })?.classFrames).toEqual({ IfcWindow: 'none' });
  });
});
