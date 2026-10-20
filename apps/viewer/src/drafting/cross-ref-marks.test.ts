/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ElevationDirection, ProjectSheet, ProjectView } from '@/project/types';
import { textBox } from './annotation';
import { elevationMarkDrafts, obstacleBoxes, type Box } from './cross-ref-marks';
import { sectionSymbolShapes } from './section-symbol';
import type { DraftEntity, Pt } from './types';

/** Where the elevation marks stand on a plan: outside the building, on the side each elevation looks at. */

const FOOTPRINT = { min: { x: 100, y: 200 }, max: { x: 112, y: 210 } };
const elevation = (direction: ElevationDirection): ProjectView => ({ id: `e-${direction}`, kind: 'elevation', name: direction, direction, createdAt: 0 });
const views = (['north', 'east', 'south', 'west'] as const).map(elevation);
const sheets: ProjectSheet[] = [
  { id: 's1', number: 'A-201', name: 'South and north', createdAt: 0, viewports: [
    { id: 'v1', viewId: 'e-south', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null },
    { id: 'v2', viewId: 'e-north', x: 300, y: 100, scale: 100, width: 0, height: 0, center: null },
  ] },
  { id: 's2', number: 'A-202', name: 'East and west', createdAt: 0, viewports: [
    { id: 'v3', viewId: 'e-east', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null },
    { id: 'v4', viewId: 'e-west', x: 300, y: 100, scale: 100, width: 0, height: 0, center: null },
  ] },
];
const make = (sheetList = sheets, viewList = views) =>
  elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views: viewList, sheets: sheetList, bounds: FOOTPRINT, paperUnit: 0.1, factor: 1 });

const labelFor = (marks: DraftEntity[], text: string) => {
  const d = marks.find((m) => m.shape.type === 'text' && m.shape.text === text);
  assert.ok(d && d.shape.type === 'text', text);
  const box = textBox(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation);
  return { x: (box[0].x + box[2].x) / 2, y: (box[0].y + box[2].y) / 2 };
};
const arrowTip = (marks: DraftEntity[], direction: ElevationDirection): { tip: Pt; base: Pt } => {
  const lines = marks.filter((m) => m.id.includes(`e-${direction}`) && m.shape.type === 'line').map((m) => (m.shape.type === 'line' ? m.shape : null)!);
  assert.equal(lines.length, 3);
  return { tip: lines[0].a, base: lines[2].a };
};

describe('elevationMarkDrafts', () => {
  const marks = make();

  it('makes a mark for each elevation, naming its drawing and its sheet', () => {
    const texts = marks.flatMap((m) => (m.shape.type === 'text' ? [m.shape.text] : [])).sort();
    assert.deepEqual(texts, ['1 / A-201', '1 / A-202', '2 / A-201', '2 / A-202']);
  });

  it('stands the north mark above the building, the south below, the east right and the west left', () => {
    // South is drawing 1 on A-201, north 2; east 1 on A-202, west 2.
    assert.ok(labelFor(marks, '2 / A-201').y < FOOTPRINT.min.y, 'north is above the top edge');
    assert.ok(labelFor(marks, '1 / A-201').y > FOOTPRINT.max.y, 'south is below the bottom edge');
    assert.ok(labelFor(marks, '1 / A-202').x > FOOTPRINT.max.x, 'east is right of the right edge');
    assert.ok(labelFor(marks, '2 / A-202').x < FOOTPRINT.min.x, 'west is left of the left edge');
  });

  it('centres each on its facade, with the arrow pointing at the building', () => {
    const north = arrowTip(marks, 'north');
    assert.ok(Math.abs(north.tip.x - 106) < 1e-9 && north.tip.y < FOOTPRINT.min.y && north.base.y < north.tip.y, 'the tip is the end nearer the building');
    const east = arrowTip(marks, 'east');
    assert.ok(Math.abs(east.tip.y - 205) < 1e-9 && east.tip.x > FOOTPRINT.max.x && east.base.x > east.tip.x);
    const south = arrowTip(marks, 'south');
    assert.ok(south.tip.y > FOOTPRINT.max.y && south.base.y > south.tip.y);
    const west = arrowTip(marks, 'west');
    assert.ok(west.tip.x < FOOTPRINT.min.x && west.base.x < west.tip.x);
  });

  it('leaves out an elevation that is on no sheet, and a detail of one', () => {
    const only = make([sheets[0]]);
    assert.equal(only.filter((m) => m.shape.type === 'text').length, 2);
    const detail: ProjectView = { ...elevation('north'), id: 'e-detail', detail: { of: 'e-north', min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, number: 1 } };
    const withDetail = make([{ ...sheets[0], viewports: [...(sheets[0].viewports ?? []), { id: 'v9', viewId: 'e-detail', x: 500, y: 100, scale: 100, width: 0, height: 0, center: null }] }, sheets[1]], [...views, detail]);
    assert.equal(withDetail.filter((m) => m.shape.type === 'text').length, 4);
  });

  it('slides the second of two marks on one side clear of the first (#134 review)', () => {
    // Two north elevations: both start at the middle of the north side; the one placed first is in the way of the other.
    const second: ProjectView = { ...elevation('north'), id: 'e-north-2' };
    const both = make([{ ...sheets[0], viewports: [...(sheets[0].viewports ?? []), { id: 'v5', viewId: 'e-north-2', x: 500, y: 100, scale: 100, width: 0, height: 0, center: null }] }, sheets[1]], [...views, second]);
    const boxOf = (prefix: string): Box => {
      const pts = both.filter((m) => m.id.includes(`:elevation:${prefix}~`)).flatMap((m) => (m.shape.type === 'line' ? [m.shape.a, m.shape.b] : m.shape.type === 'text' ? textBox(m.shape.p, m.shape.text, m.shape.height, m.shape.rotation) : []));
      assert.ok(pts.length > 0, prefix);
      return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
    };
    const a = boxOf('e-north');
    const b = boxOf('e-north-2');
    assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0, `north marks ${JSON.stringify(a)} and ${JSON.stringify(b)} do not overlap`);
    assert.ok(b.y1 < FOOTPRINT.min.y, 'the slid mark stays on the north side');
  });

  it('keeps the size on paper at the viewport scale', () => {
    const at50 = elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views, sheets, bounds: FOOTPRINT, paperUnit: 0.05, factor: 0.5 });
    const text = (list: DraftEntity[]) => list.find((m) => m.shape.type === 'text')!.shape;
    assert.equal(text(at50).type, 'text');
    // Stored height times the factor drawing multiplies it by: 2.5 mm of paper at 1:50 is 0.125 m.
    assert.ok(Math.abs((text(at50) as { height: number }).height * 0.5 - 0.125) < 1e-9);
  });

  it('slides a mark clear of a section line through the middle of its side, and stays outside the building', () => {
    // The demo case: section A cuts the building at x = 106, its symbol reaching past both the north and the south facade.
    const symbol: DraftEntity[] = sectionSymbolShapes({ x: 106, y: 198 }, { x: 106, y: 212 }, { x: 108, y: 205 }, 'A', 0.35).map((shape, i) => ({ id: `sym${i}`, viewId: 'plan', layerId: '0', shape, params: { sectionOf: 'sec' } }));
    const obstacles = obstacleBoxes(symbol);
    const at = (list: Box[]) => elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views, sheets, bounds: FOOTPRINT, paperUnit: 0.1, factor: 1, obstacles: list });
    const boxOfMark = (marks: DraftEntity[], direction: ElevationDirection): Box => {
      const pts = marks.filter((m) => m.id.includes(`e-${direction}`)).flatMap((m) => (m.shape.type === 'line' ? [m.shape.a, m.shape.b] : m.shape.type === 'text' ? textBox(m.shape.p, m.shape.text, m.shape.height, m.shape.rotation) : []));
      return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
    };
    const hits = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const marks = at(obstacles);
    for (const d of ['north', 'south'] as const) {
      const box = boxOfMark(marks, d);
      assert.equal(obstacles.some((o) => hits(box, o)), false, `${d} mark clear of the section symbol and its labels`);
      assert.ok(box.x1 < 106 || box.x0 > 106, `${d} mark is off the section line`);
    }
    assert.ok(boxOfMark(marks, 'north').y1 < FOOTPRINT.min.y, 'north stays above the building');
    assert.ok(boxOfMark(marks, 'south').y0 > FOOTPRINT.max.y, 'south stays below the building');
    // Without the symbol the marks sit on the middle, so the slide is what moved them.
    const free = boxOfMark(at([]), 'south');
    assert.ok(free.x0 < 106 && free.x1 > 106);
  });
});
