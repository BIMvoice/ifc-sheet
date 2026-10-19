/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { addProjectSheet, projectDocument, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { addProjectView } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet, hangView } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { serializeProject } from '@/project/project-file';
import { addDetail } from '@/drafting/commands/detail';
import { emptySheets } from '@/check/findings';
import { issueRecord, planIssue } from '@/issue/plan';
import { drawingListCsv, issuePrintHtml } from '@/issue/output';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { sheetSvgText } from '../sheets/sheet-export';
import { SheetPaper } from '../sheets/SheetPaper';
import { ProjectDrawer } from './ProjectDrawer.js';
import { useWallNav } from './wall-nav.js';

/**
 * #87: switching the project to A01, A02 renumbers every sheet through the
 * drawer, and every place that shows a sheet's number shows the new one:
 * the title block as exported, the issued set's drawing list, a detail
 * mark's label, a finding. No stale number is left in the saved project
 * except the issue record, which is what went out.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }, { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] }];
const LABELS = { title: 'Drawing list', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Revision' };
const state = () => useProjectStore.getState();
const numbers = () => state().sheets.map((s) => s.number);

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, drawer: true });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

function button(ui: HTMLElement, text: string): HTMLButtonElement {
  const found = [...ui.querySelectorAll('button')].find((b) => b.textContent === text);
  assert.ok(found, `a button ${text}`);
  return found;
}

/** The sheet as the title block prints and exports it. */
function exported(sheet: ProjectSheet): string {
  const ui = render(<SheetPaper sheet={sheet} projectName="P" content={() => ({ view: undefined, drawing: null, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  return sheetSvgText(ui.querySelector('svg') as unknown as SVGSVGElement, sheet);
}

describe('switching to A01, A02', () => {
  it('renumbers every sheet, and every place that shows a number follows', () => {
    // A detail on the ground floor plan, hung on its own sheet: its mark names the sheet.
    const plan = state().views.find((v) => v.kind === 'plan')!;
    const detailId = addDetail(plan.id, { x: 1, y: 1 }, { x: 3, y: 3 }, { textStyle: 'standard', dimStyle: 'standard' });
    assert.ok(detailId);
    const detail = state().views.find((v) => v.id === detailId)!;
    assert.ok(hangView(detail.id, HOUSE));
    addProjectSheet('Notes');
    const before = numbers();
    const mark = () => state().drafts.flatMap((d) => (d.shape.type === 'text' && d.params.detailOf === detailId ? [d.shape.text] : []));
    assert.deepEqual(mark(), ['1/A-901']);
    const issue = issueRecord(planIssue(state().sheets, { documents: [], drafts: state().drafts }, { name: 'Planning', date: '2026-10-19', listFirst: true }), 'iss1', 1);
    useProjectStore.setState({ issues: [issue] });

    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'A01, A02 style'));
    assert.match(ui.textContent ?? '', /Renumbering changes \d+ sheets/);
    click(button(ui, 'Renumber all'));

    const after = numbers();
    assert.equal(after.length, before.length);
    assert.deepEqual(after, after.map((_, i) => `A${String(i + 1).padStart(2, '0')}`), 'the whole set runs A01, A02, … in set order');
    for (const s of state().sheets) {
      // title block as exported
      const svg = exported(s);
      assert.ok(svg.includes(`>${s.number}</text>`), `${s.number} is printed`);
      assert.ok(!before.some((old) => svg.includes(`>${old}</text>`)), `${s.number} prints no old number`);
    }
    // the drawing list of a new issue
    const plan2 = planIssue(state().sheets, { documents: [], drafts: state().drafts }, { name: 'Next', date: '2026-10-20', listFirst: true });
    const list = `${drawingListCsv(plan2, LABELS)}${issuePrintHtml(plan2, new Map(), 'P', LABELS)}`;
    for (const s of plan2.sheets) assert.ok(list.includes(s.sheet.number));
    for (const old of before) assert.ok(!list.includes(`${old},`) && !list.includes(`<td>${old}</td>`), `the list names no ${old}`);
    // the detail mark, a derived label
    assert.deepEqual(mark(), [`1/${state().sheets.find((s) => s.viewports?.some((v) => v.viewId === detailId))!.number}`]);
    assert.ok(!mark()[0].includes('A-'));
    // a finding names the sheet by its new number
    const empty = state().sheets.find((s) => (s.viewports ?? []).length === 0)!;
    const found = emptySheets({ views: state().views, sheets: state().sheets, projectName: '', drafts: [], planElements: () => null, elementExists: () => false });
    assert.equal(found[0].params?.sheet, empty.number);
    assert.ok(!before.includes(String(found[0].params?.sheet)));
    // the saved project: no old number anywhere but in the issue record of what went out
    const { issues, ...rest } = projectDocument();
    const saved = serializeProject({ ...rest, issues: [] });
    for (const old of before) assert.ok(!saved.includes(`"${old}"`) && !saved.includes(`/${old}`), `${old} is not in the saved project`);
    assert.ok(!/A-\d{3}/.test(saved), 'no A-nnn string remains');
    assert.deepEqual(issues?.[0].sheets.map((s) => s.number), issue.sheets.map((s) => s.number), 'the issue keeps what it issued');
  });

  it('keeps a number typed by hand, and renumbers it when asked', () => {
    const id = addProjectSheet('Cover', 'other');
    setSheetNumber(id, 'COVER');
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'A01, A02 style'));
    click(button(ui, 'Renumber all'));
    assert.equal(state().sheets.find((s) => s.id === id)?.number, 'COVER');
    const toggle = [...ui.querySelectorAll('label')].find((l) => l.textContent?.includes('typed by hand too'))!.querySelector('input')!;
    click(toggle);
    click(button(ui, 'Renumber all'));
    assert.match(state().sheets.find((s) => s.id === id)!.number, /^A\d\d$/);
    assert.equal(state().sheets.find((s) => s.id === id)?.numberOverride, undefined);
  });

  it('a sheet made afterwards follows the scheme, and the scheme is saved with the project', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    click(button(ui, 'A01, A02 style'));
    click(button(ui, 'Renumber all'));
    const count = state().sheets.length;
    const id = addProjectSheet('Late');
    assert.equal(state().sheets.find((s) => s.id === id)?.number, `A${String(count + 1).padStart(2, '0')}`);
    assert.match(serializeProject(projectDocument()), /"sheetNumbering"/);
    const view = addProjectView({ kind: 'plan', name: 'Roof', level: { name: 'Roof', elevation: 6 }, cutHeight: 1.2, scale: 100 } as never);
    assert.ok(hangView(view, HOUSE));
    const holder = state().sheets.find((s) => s.viewports?.some((v) => v.viewId === view));
    assert.match(holder?.number ?? '', /^A\d\d$/, 'a view hung afterwards is on a sheet numbered by the scheme');
  });

  it('every field and button of the form keeps its own keys, so typing in it never reaches a drawing tool', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    const form = [...ui.querySelectorAll('details')].find((d) => d.textContent?.includes('Sheet numbering'))!;
    const controls = [...form.querySelectorAll('input, button')];
    assert.ok(controls.length > 8);
    for (const c of controls) assert.ok(c.closest('[data-owns-keys]'), `${c.outerHTML.slice(0, 60)} owns its keys`);
  });
});
