/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, tenth slice: a schedule that pages onto continuation sheets repeats its header on each and says it continues; a page the user
 * moved keeps its place; and the parts of a split schedule can stand side by side on one sheet when they fit, filling a sheet and
 * continuing on the next when they do not.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { cleanup, click, render } from '@/test/render.js';
import { SubReportCard } from '@/components/viewer/wall/SubReportCard';
import { openSection } from '@/test/open-section.js';
import { addSchedule, addSubReport, scheduleById } from '@/joinery/schedules.js';
import { manyTypes } from '@/joinery/schedule-fit.test.js';
import { layoutPagedTable, type TableBlock } from '@bimvoice/ifcsheet';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from '@/joinery/schedule-layout.js';
import type { ScheduleData, ScheduleEntry } from '@/joinery/schedule-data.js';
import { wallArrangeEn as enCatalogue } from '@/i18n/catalogues/wall-arrange.en.js';
import { wallArrangeRo as roCatalogue } from '@/i18n/catalogues/wall-arrange.ro.js';
import { hangSchedule } from './drawing-set-actions.js';
import { hangScheduleParts } from './schedule-hang.js';
import { resetProject, useProjectStore } from './project-store.js';
import { layoutJoineryOnSheet, syncSchedulePages } from './schedule-fit.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { updateViewport } from './sheets.js';
import { sheetDrawingArea } from './viewport-resize.js';
import type { ProjectDocument, ProjectSheet } from './types.js';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Doors and windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};
const sheets = () => useProjectStore.getState().sheets;
const holders = (id: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
const vpOf = (sheet: ProjectSheet, id: string) => sheet.viewports!.find((v) => v.viewId === id)!;
const texts = (prims: readonly SchedulePrim[]) => prims.flatMap((p) => (p.kind === 'text' ? [p] : []));

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a continuation page of a joinery schedule', () => {
  const data = manyTypes(80);
  const id = () => addSchedule('all', 'Doors and windows');

  /** The schedule hung, its pages counted, and page `page` as the Wall lays it out. */
  function pageOf(page: number, continued?: string) {
    const sid = id();
    hangSchedule(sid, data);
    const held = holders(sid);
    const sheet = held[page];
    return { sid, held, sheet, layout: layoutJoineryOnSheet({ data, labels, scale: 50, sheets: sheets(), sheet, vp: vpOf(sheet, sid), continued }) };
  }

  it('says it continues and which page it is, where the first page only counts', () => {
    const first = pageOf(0, 'continued');
    const pages = first.layout.pages!;
    assert.ok(pages > 2, `40 types take several pages (${pages})`);
    assert.equal(texts(first.layout.prims)[0].text, `Doors and windows (1/${pages})`);
    resetProject();
    const second = pageOf(1, 'continued');
    assert.equal(texts(second.layout.prims)[0].text, `Doors and windows (continued, 2/${pages})`);
  });

  it('repeats the Mark row and the row labels on every band of a continuation page, as on the first', () => {
    const first = pageOf(0, 'continued');
    resetProject();
    const next = pageOf(1, 'continued');
    const count = (prims: readonly SchedulePrim[], text: string) => texts(prims).filter((p) => p.text === text && p.x === 2).length;
    const labelColumns = (prims: readonly SchedulePrim[]) => prims.filter((p) => p.kind === 'line' && p.x1 === 34 && p.x2 === 34).length;
    for (const label of ['Mark', 'Name', 'Size', 'Total']) {
      assert.ok(count(next.layout.prims, label) >= 1, `${label} is written on the continuation page`);
      assert.equal(count(next.layout.prims, label), labelColumns(next.layout.prims), `${label}: once per band, so every band has its header`);
    }
    assert.ok(count(first.layout.prims, 'Mark') >= 1);
  });

  it('is laid out as before while no word for "continued" is given (old callers)', () => {
    const { layout } = pageOf(1);
    assert.equal(texts(layout.prims)[0].text, `Doors and windows (2/${layout.pages})`);
    const wrapped = layoutSchedule(data, labels, { scale: 50, maxWidth: layout.fit!.box.w, maxHeight: layout.fit!.box.h, page: 1 });
    assert.deepEqual(layout.prims, wrapped.prims);
  });
});

describe('a continuation page of a column table', () => {
  const block: TableBlock = {
    columns: [30, 30], header: ['Material', 'Area'], numeric: (c) => c === 1,
    rows: Array.from({ length: 40 }, (_, i) => ({ cells: [`M${i}`, String(i)], rule: 0.18 })),
  };
  it('repeats the header and says it continues', () => {
    const layout = layoutPagedTable('Takeoff', 4, [{ kind: 'table', block }], { maxHeight: 80, page: 1, continued: 'continued' });
    const pages = layout.pages!;
    assert.ok(pages > 2);
    const written = texts(layout.prims);
    assert.equal(written[0].text, `Takeoff (continued, 2/${pages})`);
    assert.deepEqual(written.filter((p) => p.bold && p.text !== written[0].text).map((p) => p.text), ['Material', 'Area'], 'the header row is written again, in bold');
    const plain = layoutPagedTable('Takeoff', 4, [{ kind: 'table', block }], { maxHeight: 80, page: 1 });
    assert.equal(texts(plain.prims)[0].text, `Takeoff (2/${pages})`, 'without the word: as before');
  });
});

describe('where a continuation page sits (#186)', () => {
  function paged() {
    const sid = addSchedule('all', 'Doors and windows');
    hangSchedule(sid, manyTypes(80));
    return { sid, held: holders(sid) };
  }

  it('a page the user moved keeps its place when the schedule is laid out again; the others follow the first sheet', () => {
    const { sid, held } = paged();
    assert.ok(held.length >= 3);
    const home = vpOf(held[0], sid);
    const moved = vpOf(held[1], sid);
    updateViewport(held[1].id, moved.id, { x: moved.x + 7, y: moved.y - 3 });
    const mine = { x: moved.x + 7, y: moved.y - 3 };
    // The first sheet's viewport is moved and resized: the page nobody moved follows, the moved one stays where it was put.
    updateViewport(held[0].id, home.id, { x: home.x - 5, y: home.y + 2, width: home.width - 30 });
    syncSchedulePages(sid, held.length);
    const now = holders(sid);
    const page1 = vpOf(now[1], sid), page2 = vpOf(now[2], sid), first = vpOf(now[0], sid);
    assert.deepEqual({ x: page1.x, y: page1.y }, mine, 'a moved page keeps its position');
    assert.deepEqual([page1.width, page1.height, page1.scale], [first.width, first.height, first.scale], 'but wraps to the first sheet\'s box');
    assert.deepEqual({ x: page2.x, y: page2.y, w: page2.width }, { x: first.x, y: first.y, w: first.width }, 'an unmoved page follows the first sheet');
  });

  it('a moved page comes back where it was after the schedule needs fewer pages and then as many again (a re-layout while the drawings load)', () => {
    const { sid, held } = paged();
    const page = vpOf(held[1], sid);
    updateViewport(held[1].id, page.id, { x: page.x + 11, y: page.y + 6 });
    const mine = { x: page.x + 11, y: page.y + 6 };
    syncSchedulePages(sid, 1);
    assert.equal(holders(sid).length, 1, 'the continuation sheets went');
    syncSchedulePages(sid, held.length);
    const back = holders(sid);
    assert.equal(back.length, held.length);
    assert.deepEqual({ x: vpOf(back[1], sid).x, y: vpOf(back[1], sid).y, placed: vpOf(back[1], sid).placed }, { ...mine, placed: true }, 'back at its place');
    assert.equal(vpOf(back[0], sid).placedPages, undefined, 'the memory is spent');
    assert.equal(vpOf(back[1], sid).placedPages, undefined, 'and is not copied onto a page');
    const home = vpOf(back[0], sid);
    assert.deepEqual([vpOf(back[2], sid).x, vpOf(back[2], sid).y], [home.x, home.y], 'a page nobody moved is where the first sheet puts it');
  });

  it('moving a page is one write that marks it placed; moving the first sheet\'s viewport marks nothing', () => {
    const { sid, held } = paged();
    const home = vpOf(held[0], sid);
    updateViewport(held[0].id, home.id, { x: home.x + 4 });
    assert.equal(vpOf(sheets().find((s) => s.id === held[0].id)!, sid).placed, undefined);
    const page = vpOf(held[1], sid);
    updateViewport(held[1].id, page.id, { x: page.x + 4 });
    assert.equal(vpOf(sheets().find((s) => s.id === held[1].id)!, sid).placed, true);
  });

  it('the position survives save and reopen, and a project saved before it opens with every page following the first', () => {
    const { sid, held } = paged();
    const page = vpOf(held[1], sid);
    updateViewport(held[1].id, page.id, { x: page.x + 9 });
    const doc = { ...parseProjectFile(serializeProject({} as ProjectDocument)), sheets: sheets() };
    const back = parseProjectFile(serializeProject(doc));
    assert.equal(vpOf(back.sheets.find((s) => s.id === held[1].id)!, sid).placed, true);
    // An older file never had the mark.
    const old = JSON.parse(serializeProject(doc));
    for (const s of old.sheets) for (const v of s.viewports) delete v.placed;
    useProjectStore.setState({ sheets: parseProjectFile(JSON.stringify(old)).sheets });
    const home = vpOf(sheets().find((s) => s.id === held[0].id)!, sid);
    syncSchedulePages(sid, held.length);
    for (const s of holders(sid).slice(1)) assert.deepEqual([vpOf(s, sid).x, vpOf(s, sid).y], [home.x, home.y], `${s.number} follows the first sheet`);
  });
});

/** `n` small types of doors and windows, every storey once. */
function types(n: number): ScheduleData {
  return {
    levels: ['Ground'],
    entries: Array.from({ length: n }, (_, i): ScheduleEntry => {
      const door = i % 2 === 0;
      return {
        key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
        width: 1, height: door ? 2.1 : 1.5, counts: { Ground: 1 }, total: 1, occurrences: [],
      };
    }),
  };
}

describe('the parts of a split schedule side by side (#186)', () => {
  /** A schedule split by hand into parts of `per` types each. */
  function parts(count: number, per: number) {
    const data = types(count * per);
    const parent = addSchedule('all', 'Joinery');
    const ids = Array.from({ length: count }, (_, p) => addSubReport(parent, `Part ${p + 1}`, { types: data.entries.slice(p * per, (p + 1) * per).map((e) => e.key) })!);
    return { data, ids };
  }
  const widthOfPart = (data: ScheduleData, from: number, per: number, area: { w: number }) => {
    const sub = { ...data, entries: data.entries.slice(from, from + per) };
    return Math.ceil(layoutSchedule(sub, labels, { scale: 50, maxWidth: area.w }).width);
  };

  it('places parts that fit next to each other on ONE sheet, top-aligned, with the same gap between each', () => {
    const { data, ids } = parts(2, 3);
    const made = hangScheduleParts(ids, { sideBySide: true, data });
    assert.equal(made.length, 1, 'one sheet');
    assert.equal(sheets().length, 1);
    const sheet = sheets()[0];
    const area = sheetDrawingArea(sheet);
    const w = widthOfPart(data, 0, 3, area);
    const [a, b] = ids.map((id) => vpOf(sheet, id));
    assert.deepEqual([a.width, a.height, a.y], [w, area.h, area.y + area.h / 2], 'the first part: its own width, the area\'s height, top at the area\'s top');
    assert.equal(a.x - a.width / 2, area.x, 'the first at the left of the area');
    assert.equal(b.y, a.y);
    assert.equal(b.x - b.width / 2 - (a.x + a.width / 2), 8, 'a gap of 8 mm');
    assert.equal(a.scale, 50);
    assert.equal(a.page, undefined);
    assert.equal(holders(ids[0]).length, 1, 'neither part pages');
  });

  it('fills the sheet and continues on the next when they do not all fit', () => {
    const { data, ids } = parts(5, 5);
    const made = hangScheduleParts(ids, { sideBySide: true, data });
    const area = sheetDrawingArea(sheets()[0]);
    const w = widthOfPart(data, 0, 5, area);
    assert.ok(w * 2 + 8 <= area.w && w * 3 + 16 > area.w, `two parts fit a sheet and three do not (${w} in ${area.w})`);
    assert.equal(made.length, 3);
    assert.deepEqual(made.map((sid) => sheets().find((s) => s.id === sid)!.viewports!.length), [2, 2, 1]);
    // The last part is alone on its sheet and takes the whole drawing area, as a part hung by itself does.
    const last = vpOf(sheets().find((s) => s.id === made[2])!, ids[4]);
    assert.deepEqual([last.width, last.height], [area.w, area.h]);
    // Every box lies in the drawing area.
    for (const s of sheets()) for (const v of s.viewports!) assert.ok(v.x - v.width / 2 >= area.x && v.x + v.width / 2 <= area.x + area.w + 1e-9, 'inside the area');
  });

  it('a part that does not fit one sheet by itself stands alone and keeps paging', () => {
    const data = types(80);
    const parent = addSchedule('all', 'Joinery');
    const small = addSubReport(parent, 'Small', { types: ['t0', 't1'] })!;
    const big = addSubReport(parent, 'Big', { types: data.entries.slice(2, 62).map((e) => e.key) })!;
    const small2 = addSubReport(parent, 'Small 2', { types: ['t62', 't63'] })!;
    const made = hangScheduleParts([small, big, small2], { sideBySide: true, data });
    assert.ok(holders(big).length > 1, 'the big part continues on further sheets');
    assert.equal(sheets().find((s) => s.id === made[0])!.viewports!.length, 1, 'it ends the sheet before it');
    assert.equal(sheets().find((s) => s.id === made[made.length - 1])!.viewports!.length, 1);
  });

  it('without the option each part keeps a sheet of its own, as before', () => {
    const { data, ids } = parts(3, 3);
    const made = hangScheduleParts(ids, { data });
    assert.equal(made.length, 3);
    const area = sheetDrawingArea(sheets()[0]);
    assert.deepEqual(sheets().map((s) => [s.viewports![0].width, s.viewports![0].height]), [[area.w, area.h], [area.w, area.h], [area.w, area.h]]);
  });
});

describe('the Wall card places the parts side by side (#186)', () => {
  const press = (view: HTMLElement, text: string) => click([...view.querySelectorAll('button')].find((b) => b.textContent === text)!);
  const catalogue = () => useProjectStore.setState({ joineryTypes: [{ ...defaultDoorSpec('D1'), id: 'd1', mark: 'D1' }, { ...defaultWindowSpec('W1'), id: 'w1', mark: 'W1' }] });

  it('"Place parts side by side" hangs doors and windows on ONE sheet; without it each has its own', () => {
    catalogue();
    const parent = addSchedule('all', 'Joinery');
    const view = render(<SubReportCard schedule={scheduleById(parent)!} />);
    openSection(view, 'Sub-reports');
    press(view, 'Place parts side by side');
    assert.equal([...view.querySelectorAll('[data-side-by-side]')][0].getAttribute('aria-pressed'), 'true');
    press(view, 'Doors and windows apart');
    assert.equal(sheets().length, 1, 'one sheet');
    assert.deepEqual(sheets()[0].viewports!.map((v) => v.viewId), (useProjectStore.getState().schedules ?? []).filter((s) => s.sub).map((s) => s.id));
    cleanup();
    resetProject();
    catalogue();
    const plain = addSchedule('all', 'Joinery');
    const plainView = render(<SubReportCard schedule={scheduleById(plain)!} />);
    openSection(plainView, 'Sub-reports');
    press(plainView, 'Doors and windows apart');
    assert.equal(sheets().length, 2, 'two sheets, as before');
  });

  it('is in Romanian too', () => {
    assert.ok(enCatalogue['wall.fitOffer.sideBySide'] && roCatalogue['wall.fitOffer.sideBySide'] && roCatalogue['schedule.continued'] && enCatalogue['schedule.continued']);
  });
});
