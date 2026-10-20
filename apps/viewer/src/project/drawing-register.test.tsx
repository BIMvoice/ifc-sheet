/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing register: a sheet whose rows are the set's sheets, read live
 * and never stored, and which is also the issue's drawing list.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureSheets } from '@/issue/capture.js';
import { planIssue } from '@/issue/plan.js';
import { drawingListCsv } from '@/issue/output.js';
import { act } from 'react';
import { drawingRegisterRows, holdsRegister, inSetOrder, registerRowsBuilt, type RegisterRow } from './drawing-register.js';
import { buildDrawingSet, drawingArea, type ModelExtent } from './drawing-set.js';
import { layoutRegisterPage, registerFit, REGISTER_MIN_TEXT_MM } from '@/joinery/register-layout.js';
import { useSheetSchedules } from '@/components/viewer/joinery/ScheduleGraphic';
import { cleanup, render } from '@/test/render.js';
import { addSchedule } from '@/joinery/schedules.js';
import { addRegisterToSet, hangSchedule, registerNumber } from './drawing-set-actions.js';
import { addProjectSheet, resetProject, setSheetNumber, useProjectStore } from './project-store.js';
import { renameProjectItem } from './project-store.js';
import { setTitleBlockField } from './sheets.js';
import { defaultViews } from './view-defaults.js';
import type { ProjectSheet } from './types';

/** The demo project's block of flats: five storeys (Parter, Etaj 1-4) at 2.8 m. */
const BLOC: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 14, z: 14 } };
const LEVELS = ['Parter', 'Etaj 1', 'Etaj 2', 'Etaj 3', 'Etaj 4'].map((name, i) => ({ name, elevation: i * 2.8, storeyGlobalIds: [`S${i}`] }));
const AS_INDICATED = 'As indicated';

function demoSet(): void {
  resetProject();
  const views = defaultViews(LEVELS);
  useProjectStore.setState({ views, sheets: buildDrawingSet({ views, extent: BLOC }) });
  addRegisterToSet('Drawing register');
}
const rows = (): RegisterRow[] => {
  const s = useProjectStore.getState();
  return drawingRegisterRows({ sheets: s.sheets, titleBlock: s.titleBlock, issues: s.issues, asIndicated: AS_INDICATED, schedules: s.schedules });
};
const sheetNamed = (name: string): ProjectSheet => {
  const found = useProjectStore.getState().sheets.find((s) => s.name === name);
  assert.ok(found, name);
  return found;
};

beforeEach(demoSet);
afterEach(cleanup);

describe('the drawing register on the demo set', () => {
  it('lists every sheet in the order the drawer lists them, with number, title and scale', () => {
    const { sheets } = useProjectStore.getState();
    const out = rows();
    assert.deepEqual(out.map((r) => r.number), inSetOrder(sheets, useProjectStore.getState().schedules).map((s) => s.number));
    assert.equal(out.length, sheets.length);
    assert.deepEqual(out.map((r) => r.number), ['A-000', 'A-101', 'A-102', 'A-103', 'A-201', 'A-202']);
    for (const r of out.slice(1)) assert.match(r.scale, /^1:\d+$/, `${r.number} ${r.scale}`);
    assert.deepEqual(out.map((r) => r.title), sheets.length === 6 ? ['Drawing register', 'Floor plans 1', 'Floor plans 2', 'Floor plans 3', 'Elevations, south and north', 'Elevations, east and west'] : []);
  });

  it('is numbered A-000, or the first free number past it', () => {
    assert.equal(useProjectStore.getState().sheets.at(-1)?.number, 'A-000');
    assert.equal(registerNumber(useProjectStore.getState().sheets), 'A-001');
    assert.equal(addRegisterToSet('Drawing register'), useProjectStore.getState().sheets.at(-1)?.id, 'a second register is not made');
  });

  it('opens the set by its kind: renumbering cannot move it', () => {
    const reg = useProjectStore.getState().sheets.find((x) => x.number === 'A-000');
    assert.ok(reg);
    setSheetNumber(reg.id, 'A-999');
    const st = useProjectStore.getState();
    assert.equal(inSetOrder(st.sheets, st.schedules)[0].id, reg.id);
    assert.equal(rows()[0].number, 'A-999');
    const plan = planIssue(st.sheets, { documents: [...st.views, ...(st.schedules ?? [])], drafts: [] }, { name: 'P', date: '2026-10-19', listFirst: false }, st.titleBlock, { schedules: st.schedules });
    assert.equal(plan.sheets[0].sheet.id, reg.id);
    assert.deepEqual(plan.sheets.slice(1).map((p) => p.row.number), ['A-101', 'A-102', 'A-103', 'A-201', 'A-202']);
  });

  it('holds no rows: the schedule that draws it stores none', () => {
    const reg = useProjectStore.getState().schedules?.find((s) => s.kind === 'register');
    assert.deepEqual(Object.keys(reg ?? {}).sort(), ['createdAt', 'id', 'kind', 'name', 'scale']);
  });
});

describe('the register follows the set', () => {
  it('adds a row when a sheet is added', () => {
    const before = rows();
    addProjectSheet('Roof detail');
    const after = rows();
    assert.equal(after.length, before.length + 1);
    assert.ok(after.some((r) => r.title === 'Roof detail'));
  });

  it('changes a row when its sheet is renamed or renumbered, and no other', () => {
    const before = rows();
    const target = sheetNamed('Floor plans 2');
    renameProjectItem(target.id, 'Etaj 1 și 2');
    setSheetNumber(target.id, 'A-150');
    const after = rows();
    const at = before.findIndex((r) => r.number === 'A-102');
    const changed = after.map((r, i) => i).filter((i) => JSON.stringify(after[i]) !== JSON.stringify(before[i]));
    assert.equal(after.some((r) => r.number === 'A-102'), false);
    assert.equal(after.filter((r) => r.number === 'A-150').length, 1);
    assert.ok(changed.includes(at) || after.length === before.length, 'the sheet kept its place');
    assert.deepEqual(after.filter((r) => r.number !== 'A-150'), before.filter((r) => r.number !== 'A-102'));
  });

  it('a new revision on one sheet changes that row only; the others are byte-equal', () => {
    const before = rows();
    const target = sheetNamed('Elevations, east and west');
    setTitleBlockField(target.id, 'revision', 'B');
    setTitleBlockField(target.id, 'date', '2026-10-19');
    const after = rows();
    const diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    assert.deepEqual(diff, [{ number: 'A-202', title: 'Elevations, east and west', scale: before.find((r) => r.number === 'A-202')?.scale ?? '', revision: 'B', date: '2026-10-19' }]);
  });

  it('dates a sheet by the last issue that held it when it has no revision date', () => {
    const issues = [
      { date: '2026-09-01', createdAt: 1, sheets: [{ number: 'A-101' }] },
      { date: '2026-10-01', createdAt: 2, sheets: [{ number: 'A-101' }, { number: 'A-201' }] },
    ] as never;
    const out = drawingRegisterRows({ sheets: useProjectStore.getState().sheets, issues });
    assert.deepEqual(out.filter((r) => r.date).map((r) => [r.number, r.date]), [['A-101', '2026-10-01'], ['A-201', '2026-10-01']]);
  });

  it('says "as indicated" for a sheet whose viewports differ in scale, and not for one whose viewports agree', () => {
    const s = sheetNamed('Floor plans 1');
    const [a, b] = s.viewports ?? [];
    assert.ok(a && b);
    const withScales = (x: number, y: number) => useProjectStore.setState((st) => ({ sheets: st.sheets.map((sh) => (sh.id === s.id ? { ...sh, viewports: [{ ...a, scale: x }, { ...b, scale: y }] } : sh)) }));
    withScales(50, 100);
    assert.equal(rows().find((r) => r.number === 'A-101')?.scale, AS_INDICATED);
    withScales(100, 100);
    assert.equal(rows().find((r) => r.number === 'A-101')?.scale, '1:100');
  });

  it('prints Romanian letters exactly', () => {
    const name = 'Parter: scară, ghișeu, țesătură';
    renameProjectItem(sheetNamed('Floor plans 1').id, name);
    assert.ok(rows().some((r) => r.title === name));
  });
});

describe('the title block scale', () => {
  const tbScale = async (sheet: ProjectSheet) => {
    const out = await captureSheets([sheet], { waitMs: 2000 });
    return out.svgs.get(sheet.id) ?? '';
  };
  it('is blank for a sheet of schedules only, and kept for a drawing sheet', async () => {
    const st = useProjectStore.getState();
    const reg = st.sheets.find((x) => x.number === 'A-000');
    assert.ok(reg);
    const svgReg = await tbScale(reg);
    assert.ok(!/>1:1</.test(svgReg) && svgReg.includes('>—<'), 'register');
    const takeoffId = hangSchedule(addSchedule('materials', 'Takeoff'));
    const sched = useProjectStore.getState().sheets.find((x) => x.id === takeoffId);
    assert.ok(sched);
    const svgSched = await tbScale(sched);
    assert.ok(!/>1:1</.test(svgSched) && svgSched.includes('>—<'), 'schedule sheet');
    assert.ok(!svgSched.includes('>1:50<'), 'the schedule viewport scale is not shown');
    const drawn: ProjectSheet = { id: 'drawn', number: 'A-401', name: 'Drawn', createdAt: 0, viewports: [{ id: 'vp', viewId: 'no-such-view', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null }] };
    assert.ok((await tbScale(drawn)).includes('>1:100<'), 'a drawing sheet keeps its scale');
  });
});

describe('the register is the drawing list', () => {
  it('comes from the same rows the issue lists', () => {
    const s = useProjectStore.getState();
    setTitleBlockField(sheetNamed('Floor plans 3').id, 'revision', 'C');
    renameProjectItem(sheetNamed('Floor plans 1').id, 'Parter și Etaj ț');
    const st = useProjectStore.getState();
    const context = { issues: st.issues, schedules: st.schedules };
    const plan = planIssue(st.sheets, { documents: [...st.views, ...(st.schedules ?? [])], drafts: [] }, { name: 'P01', date: '2026-10-19', listFirst: true, asIndicated: AS_INDICATED }, st.titleBlock, context);
    const byNumber = (a: RegisterRow, b: RegisterRow) => a.number.localeCompare(b.number, 'en', { numeric: true });
    assert.deepEqual(plan.sheets.map((p) => p.register).sort(byNumber), rows().sort(byNumber));
    assert.equal(s.sheets.length, plan.sheets.length);
    const csv = drawingListCsv(plan, { title: 'T', issue: 'I', date: 'D', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Revision' });
    const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    for (const r of rows()) assert.ok(csv.includes([r.number, r.title, r.scale].map(cell).join(',')), r.number);
  });

  it('is a normal sheet: it is in the issued set, its SVG and its DXF carry the rows', async () => {
    renameProjectItem(sheetNamed('Elevations, south and north').id, 'Fatade ț');
    const st = useProjectStore.getState();
    const register = st.sheets.find((x) => x.number === 'A-000');
    assert.ok(register);
    const plan = planIssue(st.sheets, { documents: [...st.views, ...(st.schedules ?? [])], drafts: [] }, { name: 'P01', date: '2026-10-19', listFirst: false }, st.titleBlock);
    assert.ok(plan.sheets.some((p) => p.sheet.id === register.id), 'in the issued set');
    const out = await captureSheets([register], { dxf: true, waitMs: 2000 });
    assert.deepEqual(out.failed, []);
    const svg = out.svgs.get(register.id) ?? '';
    const dxf = new TextDecoder().decode(out.dxfs.get(register.id));
    for (const r of rows()) {
      for (const text of [r.number, r.title, r.scale]) if (text) assert.ok(svg.includes(text), `svg: ${text}`);
      for (const text of [r.number, r.scale]) if (text) assert.ok(dxf.includes(text), `dxf: ${text}`);
    }
    assert.ok(svg.includes('Fatade ț'));
    assert.ok(dxf.includes('Elevations, east and west'));
  });
});

describe('a register longer than its paper (#126 review)', () => {
  /** A set of `n` drawing sheets and the register, on the set paper (A2). */
  const bigSet = (n: number) => {
    resetProject();
    useProjectStore.setState({
      sheets: Array.from({ length: n }, (_, i): ProjectSheet => ({
        id: `s${i}`, number: `A-${101 + i}`, name: `Sheet ${i + 1}`, createdAt: i, paper: 'A2', orientation: 'landscape',
        viewports: [{ id: `vp${i}`, viewId: 'v1', x: 200, y: 150, scale: 100, width: 0, height: 0, center: null }],
      })),
    });
    addRegisterToSet('Drawing register');
  };
  const registerSheets = () => {
    const st = useProjectStore.getState();
    return inSetOrder(st.sheets, st.schedules).filter((s) => holdsRegister(s, st.schedules));
  };
  const labels = { title: 'Drawing register', number: 'Sheet', sheetTitle: 'Title', scale: 'Scale', revision: 'Rev', date: 'Date' };

  it('with 120 sheets goes onto a continuation sheet A-000.1, every page inside the drawing area with text no smaller than 1.8 mm', async () => {
    bigSet(120);
    const pages = registerSheets();
    assert.deepEqual(pages.map((s) => s.number), ['A-000', 'A-000.1']);
    const all = rows();
    assert.equal(all.length, 122, 'the continuation sheet is a row too');
    const fit = registerFit(all.length, drawingArea('A2').h);
    assert.equal(fit.pages, 2);
    const pageOfRow = new Map<string, number>();
    for (let page = 0; page < fit.pages; page++) {
      const layout = layoutRegisterPage(all, labels, fit, page);
      for (const p of layout.prims) if (p.kind === 'text' && /^A-\d/.test(p.text)) {
        assert.equal(pageOfRow.has(p.text), false, `${p.text} on two pages`);
        pageOfRow.set(p.text, page);
      }
      assert.ok(layout.height <= drawingArea('A2').h, `page ${page}: ${layout.height} mm tall`);
      for (const p of layout.prims) if (p.kind === 'text') assert.ok(p.size >= REGISTER_MIN_TEXT_MM - 1e-9, `text ${p.size} mm`);
    }
    assert.deepEqual([...pageOfRow.keys()].sort(), all.map((r) => r.number).sort(), 'every row on one page');
    // Printed through the sheet: the first sheet's row on the register's own sheet, the last one's on the continuation sheet.
    const out = await captureSheets(pages, { waitMs: 2000 });
    assert.deepEqual(out.failed, []);
    const [own, next] = pages.map((s) => out.svgs.get(s.id) ?? '');
    assert.ok(own.includes('>A-101<') && !next.includes('>A-101<'));
    assert.ok(next.includes('>A-220<') && !own.includes('>A-220<'));
    assert.ok(next.includes('Drawing register (2/2)'));
  });

  it('shrinks a register a little too long instead of splitting it, and drops the continuation sheet once it fits again', () => {
    bigSet(60);
    assert.deepEqual(registerSheets().map((s) => s.number), ['A-000']);
    const fit = registerFit(rows().length, drawingArea('A2').h);
    assert.ok(fit.pages === 1 && fit.scale < 1 && fit.scale >= REGISTER_MIN_TEXT_MM / 2.5, `scale ${fit.scale}`);
    bigSet(120);
    assert.equal(registerSheets().length, 2);
    useProjectStore.setState((st) => ({ sheets: st.sheets.filter((s) => !/^s([4-9]\d|1\d\d)$/.test(s.id)) }));
    assert.deepEqual(registerSheets().map((s) => s.number), ['A-000']);
  });

  it('builds one row when one sheet is edited, not a row for every sheet on screen', () => {
    bigSet(120);
    const st = useProjectStore.getState();
    function Every() {
      const sheets = useProjectStore((s) => s.sheets);
      return <>{sheets.map((s) => <One key={s.id} sheet={s} />)}</>;
    }
    function One({ sheet }: { sheet: ProjectSheet }) {
      useSheetSchedules(sheet);
      return null;
    }
    render(<Every />);
    const before = registerRowsBuilt();
    const target = st.sheets.find((s) => s.id === 's7');
    assert.ok(target);
    act(() => {
      useProjectStore.setState((now) => ({ sheets: now.sheets.map((s) => (s.id === 's7' ? { ...s, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, scale: 50 })) } : s)) }));
    });
    assert.equal(registerRowsBuilt() - before, 1);
    assert.equal(rows().find((r) => r.number === target.number)?.scale, '1:50');
  });
});
