/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The handover action and its file name pattern in the issue form (#83), in English and in Romanian. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render, type as typeInto } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { planFor } from '@/issue/run';
import { issueRecord, todayText } from '@/issue/plan';
import type { ProjectSheet } from '@/project/types';
import { IssueForm } from './IssueForm';
import { WALL_SKIN } from './set-skin';

beforeEach(() => { resetProject(); registerLocale('ro', ro); });
afterEach(() => { cleanup(); setLocale('en'); resetProject(); });

const field = (root: HTMLElement) => root.querySelector<HTMLInputElement>('#handover-pattern')!;

describe('the handover in the issue form', () => {
  it('offers the action beside the issue formats and shows the default pattern with an example name', () => {
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok([...root.querySelectorAll('button')].some((b) => b.textContent === 'Hand over (ZIP)'));
    assert.equal(field(root).value, '{number} {sheet}');
    assert.ok(root.textContent?.includes('Example: A-101 Ground floor.dxf'));
    assert.equal(useProjectStore.getState().handoverPattern, undefined, 'looking at the default stores nothing');
  });

  it('stores the pattern with the project as it is typed, shows the name it makes, and goes back to the default', () => {
    const root = render(<IssueForm skin={WALL_SKIN} />);
    typeInto(field(root), '{number}_{sheet} rev {revision}');
    assert.equal(useProjectStore.getState().handoverPattern, '{number}_{sheet} rev {revision}');
    assert.equal(useProjectStore.getState().dirty, true);
    assert.ok(root.textContent?.includes('Example: A-101_Ground floor rev B.dxf'), root.textContent ?? '');
    const reset = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Default')!;
    click(reset);
    assert.equal(useProjectStore.getState().handoverPattern, undefined);
    assert.equal(field(root).value, '{number} {sheet}');
  });

  it('is in Romanian too, and keeps the file names ASCII', () => {
    setLocale('ro');
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok([...root.querySelectorAll('button')].some((b) => b.textContent === 'Predă (ZIP)'));
    assert.ok(root.textContent?.includes('Tiparul denumirii fișierelor'));
    typeInto(field(root), '{sheet}');
    assert.ok(root.textContent?.includes('Exemplu: Ground floor.dxf'));
  });
});

const vp = (viewId: string) => ({ id: `vp-${viewId}`, viewId, x: 0, y: 0, scale: 50, width: 0, height: 0, center: null });
const sheet = (id: string, number: string, view: string): ProjectSheet => ({ id, number, name: `Sheet ${number}`, createdAt: 1, viewports: [vp(view)] });
const dimension = (viewId: string) => ({ id: `d-${viewId}`, viewId, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }, params: {} }) as never;

/** Two sheets issued once, then the second one edited. */
function twoSheets(): string[] {
  const ids = ['One', 'Two'].map((name) => addProjectView({ kind: 'plan', name, level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never));
  useProjectStore.setState({ sheets: [sheet('s1', 'A-101', ids[0]), sheet('s2', 'A-102', ids[1])] });
  return ids;
}

function issuedThenEdited(): void {
  const [, two] = twoSheets();
  useProjectStore.setState({ issues: [issueRecord(planFor({ name: 'Issue 1', date: '2026-10-01' }), 'i1', 1)] });
  useProjectStore.setState({ drafts: [dimension(two)] });
}

describe('the issue date and what changed, in the issue form', () => {
  it('offers a date field that starts as today and keeps what is chosen', () => {
    const root = render(<IssueForm skin={WALL_SKIN} />);
    const date = root.querySelector<HTMLInputElement>('#issue-date')!;
    assert.equal(date.type, 'date');
    assert.equal(date.value, todayText());
    typeInto(date, '2026-11-03');
    assert.equal(date.value, '2026-11-03');
    assert.ok(root.textContent?.includes('Example: A-101 Ground floor.dxf'));
  });

  it('says there is nothing to compare with on a first issue', () => {
    twoSheets();
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok(root.textContent?.includes('This is the first issue'), root.textContent ?? '');
  });

  it('lists the sheet that changed since the last issue and offers a revision for it, one undo step', () => {
    issuedThenEdited();
    const root = render(<IssueForm skin={WALL_SKIN} />);
    const text = root.querySelector('[data-issue-changes]')!.textContent ?? '';
    assert.ok(text.includes('Since "Issue 1"'), text);
    assert.ok(text.includes('Changed (1): A-102 Sheet A-102'), text);
    assert.ok(!text.includes('A-101'), 'the sheet that was not edited is not listed');
    const bump = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Add a revision to this sheet')!;
    assert.ok(bump);
    click(bump);
    const state = useProjectStore.getState();
    assert.equal(state.revisions?.length, 1);
    assert.deepEqual(state.sheets.map((s) => s.revisionIds ?? []), [[], [state.revisions![0].id]]);
    assert.ok(![...root.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Add a revision')), 'no longer offered once bumped');
  });

  it('says a previous issue without fingerprints cannot be compared, rather than that nothing changed', () => {
    issuedThenEdited();
    const [first] = useProjectStore.getState().issues!;
    useProjectStore.setState({ issues: [{ ...first, sheets: first.sheets.map((r) => ({ ...r, fingerprint: '' })) }] });
    const root = render(<IssueForm skin={WALL_SKIN} />);
    const text = root.querySelector('[data-issue-changes]')!.textContent ?? '';
    assert.ok(text.includes("No fingerprint for the previous issue; changes can't be listed."), text);
    assert.ok(!text.includes('No sheet has been added'), text);
    assert.ok(![...root.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Add a revision')));
  });

  it('is in Romanian too', () => {
    issuedThenEdited();
    setLocale('ro');
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok(root.textContent?.includes('Data emiterii'));
    const text = root.querySelector('[data-issue-changes]')!.textContent ?? '';
    assert.ok(text.includes('Modificată (1): A-102 Sheet A-102'), text);
    assert.ok([...root.querySelectorAll('button')].some((b) => b.textContent === 'Adaugă o revizie acestei planșe'));
  });
});
