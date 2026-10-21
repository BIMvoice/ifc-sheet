/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, first slice, on the sheets: a schedule hung on the set fills the
 * drawing area and continues on A-6xx.1… when its bands do not fit; a resize
 * re-wraps it; and what prints (SVG, PDF's SVG, DXF) lies inside the frame.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { addSchedule } from '@/joinery/schedules.js';
import { manyTypes } from '@/joinery/schedule-fit.test.js';
import { layoutSchedule, type ScheduleLabels } from '@/joinery/schedule-layout.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetPrintHtml, sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { schedulePoints } from '@/test/schedule-dxf-points.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { frameOf, frameRect } from './sheet-frame.js';
import { paperOf, updateViewport } from './sheets.js';
import { layoutJoineryOnSheet, paperHolding, syncSchedulePages } from './schedule-fit.js';
import { resizedFrame, sheetDrawingArea } from './viewport-resize.js';
import type { ProjectSheet } from './types';

const labels: ScheduleLabels = {
  title: 'Doors and windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};
const sheets = () => useProjectStore.getState().sheets;
const holders = (scheduleId: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === scheduleId)).sort((a, b) => a.number.localeCompare(b.number));

/** The sheet as the Wall draws it: each viewport's page wrapped to the first sheet's box (`layoutJoineryOnSheet`). */
function paperOfSheet(sheet: ProjectSheet, scheduleId: string, data = manyTypes(40)): SVGSVGElement {
  let el: SVGSVGElement | null = null;
  render(
    <SheetPaper
      ref={(s) => { el = s; }} sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1}
      content={(vp) => ({ view: undefined, drawing: null, drafts: [], schedule: layoutJoineryOnSheet({ data, labels, scale: 50, sheets: sheets(), sheet, vp }) })}
    />,
  );
  assert.ok(el, 'the sheet renders');
  return el;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a schedule hung on the set (#186)', () => {
  it('fills the sheet\'s drawing area and continues on A-6xx.1… with every band inside the frame', () => {
    const id = addSchedule('all', 'Doors and windows');
    const sheetId = hangSchedule(id, manyTypes(40));
    assert.ok(sheetId);
    const held = holders(id);
    assert.ok(held.length > 1, `40 types need continuation sheets (${held.length})`);
    const [first, ...rest] = held;
    const area = sheetDrawingArea(first);
    const vp = first.viewports![0];
    assert.deepEqual({ w: vp.width, h: vp.height, x: vp.x, y: vp.y }, { w: area.w, h: area.h, x: area.x + area.w / 2, y: area.y + area.h / 2 }, 'the viewport is the drawing area');
    rest.forEach((s, i) => {
      assert.equal(s.number, `${first.number}.${i + 1}`);
      assert.equal(s.viewports![0].page, i + 1);
      assert.equal(s.paper, first.paper);
      assert.deepEqual(s.viewports![0].width, vp.width);
    });
    // Every page: all that is drawn lies inside its sheet's frame.
    for (const sheet of held) {
      const frame = frameRect(paperOf(sheet), frameOf(sheet));
      const svg = paperOfSheet(sheet, id);
      const clip = svg.querySelector('clipPath rect');
      assert.ok(clip, 'the table is clipped to its viewport');
      const r = { x: Number(clip.getAttribute('x')), y: Number(clip.getAttribute('y')), w: Number(clip.getAttribute('width')), h: Number(clip.getAttribute('height')) };
      assert.ok(r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w + 1e-6 && r.y + r.h <= frame.y + frame.h + 1e-6, `the box lies in the frame on ${sheet.number}`);
      cleanup();
    }
  });

  it('prints inside the frame: SVG, the PDF\'s page and DXF, on every page', () => {
    const id = addSchedule('all', 'Doors and windows');
    hangSchedule(id, manyTypes(40));
    for (const sheet of holders(id)) {
      const frame = frameRect(paperOf(sheet), frameOf(sheet));
      const layout = layoutJoineryOnSheet({ data: manyTypes(40), labels, scale: 50, sheets: sheets(), sheet, vp: sheet.viewports![0] });
      const box = layout.fit!.box;
      assert.ok(layout.width <= box.w + 1e-6 && layout.height <= box.h + 1e-6, `${sheet.number}: ${layout.width}x${layout.height} in ${box.w}x${box.h}`);
      const svg = paperOfSheet(sheet, id);
      const text = sheetSvgText(svg, sheet);
      assert.match(text, /Doors and windows/);
      assert.match(sheetPrintHtml(svg, sheet), /Doors and windows/, 'the PDF prints this SVG');
      // The DXF: no point of the table outside the frame. happy-dom resolves no screen matrix, so the points come out in the table's own
      // frame (the group's translate not applied): put the box's corner back, as a browser's matrix does.
      const dxf = new TextDecoder().decode(sheetDxf(svg, sheet));
      const pts = schedulePoints(dxf).map((p) => ({ x: p.x + box.x, y: paperOf(sheet).h - p.y + box.y }));
      assert.ok(pts.length > 20, `${sheet.number}: the DXF has the table's geometry (${pts.length} points)`);
      const outside = pts.filter((p) => p.x < frame.x - 1e-6 || p.x > frame.x + frame.w + 1e-6 || p.y < frame.y - 1e-6 || p.y > frame.y + frame.h + 1e-6);
      assert.deepEqual(outside.slice(0, 3), [], `${sheet.number}: DXF points outside the frame`);
      cleanup();
    }
  });

  it('a resize re-wraps the bands, and the continuation sheets follow the first one\'s box', () => {
    const id = addSchedule('all', 'Doors and windows');
    hangSchedule(id, manyTypes(40));
    const first = holders(id)[0];
    const vp = first.viewports![0];
    const before = holders(id).length;
    const area = sheetDrawingArea(first);
    // Narrower: drag the east edge in by a third.
    const edge = { x: vp.x + vp.width / 2 - area.w / 3, y: vp.y };
    const next = resizedFrame(vp, { width: vp.width, height: vp.height }, 'e', edge, area, { x: 0, y: 0 }, { x: 1, y: 1 });
    updateViewport(first.id, vp.id, next);
    const narrow = layoutJoineryOnSheet({ data: manyTypes(40), labels, scale: 50, sheets: sheets(), sheet: sheets().find((s) => s.id === first.id)!, vp: { ...vp, ...next } });
    assert.ok(narrow.width <= next.width + 1e-6, `${narrow.width} wraps to ${next.width}`);
    assert.ok((narrow.pages ?? 1) > before, `narrower needs more pages (${narrow.pages} > ${before})`);
    syncSchedulePages(id, narrow.pages!);
    const held = holders(id);
    assert.equal(held.length, narrow.pages);
    for (const s of held.slice(1)) assert.deepEqual([s.viewports![0].width, s.viewports![0].x], [next.width, next.x], 'a continuation sheet follows the first one\'s box');
    // Wider again: pages go back, the numbers stay a run.
    const wide = layoutSchedule(manyTypes(40), labels, { scale: 50, maxWidth: area.w, maxHeight: area.h });
    syncSchedulePages(id, wide.pages!);
    assert.equal(holders(id).length, before);
  });

  it('a resize stops at one band whole, and every page wraps to the first sheet\'s box', () => {
    const id = addSchedule('all', 'Doors and windows');
    hangSchedule(id, manyTypes(40));
    const [first, second] = holders(id);
    const vp = first.viewports![0];
    const min = { width: 120, height: 90 };
    const area = sheetDrawingArea(first);
    const shrunk = resizedFrame(vp, { width: vp.width, height: vp.height }, 'se', { x: 0, y: 0 }, area, { x: 0, y: 0 }, { x: 1, y: 1 }, min);
    assert.deepEqual([shrunk.width, shrunk.height], [min.width, min.height]);
    const views = { data: manyTypes(40), labels, scale: 50, sheets: sheets(), sheet: second };
    const own = layoutJoineryOnSheet({ ...views, vp: second.viewports![0] });
    const moved = layoutJoineryOnSheet({ ...views, vp: { ...second.viewports![0], width: 100, height: 60 } });
    assert.deepEqual(moved.prims, own.prims, 'the second page breaks where the first sheet\'s box says');
  });

  it('makes the sheet the next larger paper when one band does not fit the template\'s', () => {
    const sheet: ProjectSheet = { id: 's', number: 'A-601', name: 'x', createdAt: 0, paper: 'A4', orientation: 'landscape', viewports: [] };
    const small = manyTypes(3);
    const area4 = sheetDrawingArea(sheet);
    const chosen = paperHolding(sheet, small, 50);
    assert.notEqual(chosen, 'A0');
    const bigger = sheetDrawingArea({ ...sheet, paper: chosen });
    assert.ok(bigger.w >= area4.w);
    assert.equal(paperHolding({ ...sheet, paper: 'A0' }, small, 50), 'A0');
  });

  it('a small schedule hangs on one sheet, unchanged', () => {
    const id = addSchedule('all', 'Doors and windows');
    hangSchedule(id, manyTypes(8));
    assert.equal(holders(id).length, 1);
    assert.equal(holders(id)[0].viewports![0].page, undefined);
  });
});
