/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, second slice, on the sheets: the takeoff, the room finishes, the types and the urban indicators fit the paper the way the
 * joinery schedule does. A schedule large enough to overflow A3 continues on A-6xx.1… with every row inside the frame in SVG, in
 * the PDF's page and in DXF; a resize re-wraps it; a small one is unchanged.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { addSchedule } from '@/joinery/schedules.js';
import { KINDS } from '@/joinery/paged-table.test.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetPrintHtml, sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { schedulePoints } from '@/test/schedule-dxf-points.js';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { frameOf, frameRect } from './sheet-frame.js';
import { paperOf, updateViewport } from './sheets.js';
import { layoutTableOnSheet, syncSchedulePages } from './schedule-fit.js';
import { resizedFrame, sheetDrawingArea } from './viewport-resize.js';
import type { ProjectSchedule, ProjectSheet } from './types';

const SCHEDULE_KIND: Record<string, ProjectSchedule['kind']> = { takeoff: 'materials', finishes: 'finishes', types: 'types', urban: 'urban', rooms: 'rooms' };
const N = 90;
const sheets = () => useProjectStore.getState().sheets;
const holders = (scheduleId: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === scheduleId)).sort((a, b) => a.number.localeCompare(b.number));

/** The layout of `sheet`'s viewport as the Wall draws it (`useSheetSchedules`): its page, wrapped to the first sheet's box. */
const layoutOf = (kind: (typeof KINDS)[number], n: number, sheet: ProjectSheet) => layoutTableOnSheet({ sheets: sheets(), sheet, vp: sheet.viewports![0] }, (paging) => kind.layout(n, paging));

function paperOfSheet(kind: (typeof KINDS)[number], n: number, sheet: ProjectSheet): SVGSVGElement {
  let el: SVGSVGElement | null = null;
  render(
    <SheetPaper
      ref={(s) => { el = s; }} sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1}
      content={() => ({ view: undefined, drawing: null, drafts: [], schedule: layoutOf(kind, n, sheet) })}
    />,
  );
  assert.ok(el, 'the sheet renders');
  return el;
}

/** Hang the kind's schedule and let the sheets follow its layout, as the sheet's own effect does when it draws. */
function hung(kind: (typeof KINDS)[number], n: number): string {
  const id = addSchedule(SCHEDULE_KIND[kind.kind], kind.kind);
  assert.ok(hangSchedule(id));
  syncSchedulePages(id, layoutOf(kind, n, holders(id)[0]).pages!);
  return id;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

for (const kind of KINDS) {
  describe(`${kind.kind}: a schedule that fits the paper (#186)`, () => {
    it('fills the drawing area when hung and continues on A-6xx.1… with every row inside the frame, in SVG, print and DXF', () => {
      const id = hung(kind, N);
      const held = holders(id);
      assert.ok(held.length > 1, `${N} rows need continuation sheets (${held.length})`);
      const [first, ...rest] = held;
      const area = sheetDrawingArea(first);
      const vp = first.viewports![0];
      assert.deepEqual({ w: vp.width, h: vp.height }, { w: area.w, h: area.h }, 'the viewport is the drawing area');
      rest.forEach((s, i) => {
        assert.equal(s.number, `${first.number}.${i + 1}`);
        assert.equal(s.viewports![0].page, i + 1);
        assert.equal(s.paper, first.paper);
      });
      for (const sheet of held) {
        const frame = frameRect(paperOf(sheet), frameOf(sheet));
        const layout = layoutOf(kind, N, sheet);
        const box = layout.fit!.box;
        assert.ok(layout.height <= box.h + 1e-6 && layout.width <= box.w + 1e-6, `${sheet.number}: ${layout.width}x${layout.height} in ${box.w}x${box.h}`);
        const svg = paperOfSheet(kind, N, sheet);
        const clip = svg.querySelector('clipPath rect');
        assert.ok(clip, 'the table is clipped to its viewport');
        const r = { x: Number(clip.getAttribute('x')), y: Number(clip.getAttribute('y')), w: Number(clip.getAttribute('width')), h: Number(clip.getAttribute('height')) };
        assert.ok(r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w + 1e-6 && r.y + r.h <= frame.y + frame.h + 1e-6, `the box lies in the frame on ${sheet.number}`);
        assert.match(sheetSvgText(svg, sheet), new RegExp(kind.layout(1).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []))[0]));
        assert.match(sheetPrintHtml(svg, sheet), /<svg/, 'the PDF prints this SVG');
        // happy-dom resolves no screen matrix, so the DXF points come out in the table's own frame: put the box's corner back, as a browser's matrix does.
        const pts = schedulePoints(new TextDecoder().decode(sheetDxf(svg, sheet))).map((p) => ({ x: p.x + box.x, y: paperOf(sheet).h - p.y + box.y }));
        assert.ok(pts.length > 20, `${sheet.number}: the DXF has the table's geometry (${pts.length} points)`);
        const outside = pts.filter((p) => p.x < frame.x - 1e-6 || p.x > frame.x + frame.w + 1e-6 || p.y < frame.y - 1e-6 || p.y > frame.y + frame.h + 1e-6);
        assert.deepEqual(outside.slice(0, 3), [], `${sheet.number}: DXF points outside the frame`);
        cleanup();
      }
    });

    it('a resize re-wraps the rows, the continuation sheets follow the first one\'s box, and it stops at one row whole', () => {
      const id = hung(kind, N);
      const first = holders(id)[0];
      const before = holders(id).length;
      const vp = first.viewports![0];
      const area = sheetDrawingArea(first);
      // Shorter: drag the south edge up by a third of the area.
      const edge = { x: vp.x, y: vp.y + vp.height / 2 - area.h / 3 };
      const next = resizedFrame(vp, { width: vp.width, height: vp.height }, 's', edge, area, { x: 0, y: 0 }, { x: 1, y: 1 }, layoutOf(kind, N, first).fit!.min);
      updateViewport(first.id, vp.id, next);
      const now = sheets().find((s) => s.id === first.id)!;
      const shorter = layoutOf(kind, N, now);
      assert.ok(shorter.height <= next.height + 1e-6, `${shorter.height} within ${next.height}`);
      assert.ok(shorter.pages! > before, `shorter needs more pages (${shorter.pages} > ${before})`);
      syncSchedulePages(id, shorter.pages!);
      const held = holders(id);
      assert.equal(held.length, shorter.pages);
      for (const s of held.slice(1)) assert.deepEqual([s.viewports![0].height, s.viewports![0].y], [next.height, next.y], 'a continuation sheet follows the first one\'s box');
      // The grips stop at the smallest box, not at nothing.
      const min = shorter.fit!.min;
      const smallest = resizedFrame(next.height ? { ...vp, ...next } : vp, { width: next.width, height: next.height }, 'se', { x: 0, y: 0 }, area, { x: 0, y: 0 }, { x: 1, y: 1 }, min);
      assert.deepEqual([smallest.width, smallest.height], [min.width, min.height]);
      // Taller again: the pages go back.
      updateViewport(first.id, vp.id, { height: area.h, y: vp.y });
      syncSchedulePages(id, layoutOf(kind, N, sheets().find((s) => s.id === first.id)!).pages!);
      assert.equal(holders(id).length, before);
    });

    it('every page breaks where the first sheet\'s box says, whatever box its own viewport carries', () => {
      const id = hung(kind, N);
      const second = holders(id)[1];
      const own = layoutOf(kind, N, second);
      const moved = layoutTableOnSheet({ sheets: sheets(), sheet: second, vp: { ...second.viewports![0], width: 100, height: 60 } }, (paging) => kind.layout(N, paging));
      assert.deepEqual(moved.prims, own.prims, 'the second page breaks where the first sheet\'s box says');
    });

    it('a small schedule is unchanged: one sheet, and the table is what it drew before', () => {
      const id = addSchedule(SCHEDULE_KIND[kind.kind], kind.kind);
      hangSchedule(id);
      syncSchedulePages(id, layoutOf(kind, 4, holders(id)[0]).pages!);
      assert.equal(holders(id).length, 1);
      assert.equal(holders(id)[0].viewports![0].page, undefined);
      const layout = layoutOf(kind, 4, holders(id)[0]);
      assert.deepEqual(layout.prims, kind.layout(4).prims);
      assert.equal(layout.pages, 1);
    });
  });
}
