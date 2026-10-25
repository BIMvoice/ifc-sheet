/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What changed since the last issue (#331): the plan against the previous record, the bump action, the record and the drawing list. */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftEntity } from '@/drafting/types.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { sheetFingerprint } from '@/project/sheet-fingerprint.js';
import type { ProjectIssue, ProjectSheet } from '@/project/types.js';
import { addRevisionToSheets } from './changes-actions';
import { issueRecord, planIssue } from './plan.js';
import { drawingListCsv, drawingListRows } from './output.js';
import { readIssues } from './file.js';

const vp = (viewId: string) => ({ id: `vp-${viewId}`, viewId, x: 0, y: 0, scale: 50, width: 0, height: 0, center: null });
const sheet = (id: string, number: string, view: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: `Sheet ${number}`, createdAt: 1, viewports: [vp(view)], ...extra });
const dimension = (id: string, viewId: string): DraftEntity => ({ id, viewId, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }, params: {} }) as never;
const documents = [{ id: 'v1', createdAt: 1 }, { id: 'v2', createdAt: 1 }, { id: 'v3', createdAt: 1 }];
const sources = (drafts: DraftEntity[] = [], revisions: never[] | { id: string; code: string; date: string; description: string; by: string }[] = []) => ({ documents, drafts, views: [], sheets: [], revisions });
const input = { name: 'Issue', date: '2026-10-25', listFirst: true };
const labels = { title: 'Drawing list', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Revision', landscape: 'landscape', portrait: 'portrait', drawingList: 'drawing list' };
const change = { change: 'Change', new: 'New', changed: 'Changed', removed: 'Removed' };
const SET = [sheet('s1', 'A-101', 'v1'), sheet('s2', 'A-102', 'v2'), sheet('s3', 'A-103', 'v3')];

const issueOf = (sheets: ProjectSheet[], src = sources(), issues: ProjectIssue[] = [], id = `i${issues.length + 1}`) => {
  const plan = planIssue(sheets, src, input, undefined, { issues });
  return { plan, record: issueRecord(plan, id, issues.length + 1) };
};
const numbers = (list: { number: string }[]) => list.map((s) => s.number);

describe('what changed since the last issue', () => {
  it('lists exactly the sheet that was edited between two issues', () => {
    const first = issueOf(SET);
    const edited = issueOf(SET, sources([dimension('d1', 'v2')]), [first.record]);
    assert.equal(edited.plan.changes.status, 'compared');
    assert.deepEqual(numbers(edited.plan.changes.changed), ['A-102']);
    assert.deepEqual([edited.plan.changes.added, edited.plan.changes.removed], [[], []]);
  });

  it('lists nothing for an unchanged re-issue, and the fingerprints are the same across a re-render', () => {
    const first = issueOf(SET, sources([dimension('d1', 'v2')]));
    const again = issueOf(SET.map((s) => ({ ...s })), sources([{ ...dimension('d1', 'v2') }]), [first.record]);
    assert.equal(again.plan.changes.status, 'compared');
    assert.deepEqual([again.plan.changes.added, again.plan.changes.removed, again.plan.changes.changed], [[], [], []]);
    assert.deepEqual(again.record.sheets.map((r) => r.fingerprint), first.record.sheets.map((r) => r.fingerprint));
    assert.equal(sheetFingerprint(SET[0], sources()), sheetFingerprint(SET[0], sources()));
  });

  it('the issue date does not change a fingerprint', () => {
    const a = planIssue(SET, sources(), { ...input, date: '2026-10-25' });
    const b = planIssue(SET, sources(), { ...input, date: '2026-12-01', name: 'Other' });
    assert.deepEqual(a.sheets.map((s) => s.row.fingerprint), b.sheets.map((s) => s.row.fingerprint));
  });

  it('lists a sheet added and a sheet removed', () => {
    const first = issueOf(SET.slice(0, 2));
    const next = issueOf([SET[1], SET[2]], sources(), [first.record]);
    assert.deepEqual(numbers(next.plan.changes.added), ['A-103']);
    assert.deepEqual(numbers(next.plan.changes.removed), ['A-101']);
    assert.deepEqual(next.plan.changes.changed, []);
  });

  it('follows a sheet by its id when it is renumbered: changed, not added and removed', () => {
    const first = issueOf(SET);
    const next = issueOf([SET[0], { ...SET[1], number: 'A-120' }, SET[2]], sources(), [first.record]);
    assert.deepEqual(numbers(next.plan.changes.changed), ['A-120']);
    assert.deepEqual([next.plan.changes.added, next.plan.changes.removed], [[], []]);
  });

  it('compares with the latest issue, not the first', () => {
    const one = issueOf(SET);
    const two = issueOf(SET, sources([dimension('d1', 'v1')]), [one.record]);
    const three = issueOf(SET, sources([dimension('d1', 'v1')]), [one.record, two.record]);
    assert.deepEqual(three.plan.changes.changed, []);
    assert.equal(three.plan.changes.against?.id, 'i2');
  });

  it('says "first" for the first issue and lists nothing as changed', () => {
    const first = issueOf(SET);
    assert.equal(first.plan.changes.status, 'first');
    assert.deepEqual([first.plan.changes.added, first.plan.changes.changed], [[], []]);
  });

  it('a previous record without fingerprints cannot be compared: unknown, never "nothing changed"', () => {
    const first = issueOf(SET);
    const old: ProjectIssue = { ...first.record, sheets: first.record.sheets.map((r) => ({ ...r, fingerprint: '' })) };
    const next = issueOf(SET, sources([dimension('d1', 'v1')]), [old]);
    assert.equal(next.plan.changes.status, 'unknown');
    assert.deepEqual([next.plan.changes.added, next.plan.changes.removed, next.plan.changes.changed], [[], [], []]);
    assert.equal(next.record.changes, undefined, 'nothing is recorded as a comparison');
  });

  it('a changed sheet whose revision is the one the previous issue carried is offered a bump; a bumped one is not', () => {
    const revisions = [{ id: 'ra', code: 'A', date: '', description: '', by: '' }, { id: 'rb', code: 'B', date: '', description: '', by: '' }];
    const base = SET.map((s) => ({ ...s, revisionIds: ['ra'] }));
    const first = issueOf(base, sources([], revisions));
    const next = issueOf([base[0], { ...base[1], revisionIds: ['ra', 'rb'] }, base[2]], sources([dimension('d1', 'v1'), dimension('d2', 'v2')], revisions), [first.record]);
    assert.deepEqual(numbers(next.plan.changes.changed), ['A-101', 'A-102']);
    assert.deepEqual(next.plan.changes.unbumped.map((u) => u.sheetId), ['s1']);
  });
});

describe('the record and the drawing list', () => {
  it('records the comparison with the issue, and reads it back', () => {
    const first = issueOf(SET);
    const next = issueOf(SET.slice(1), sources([dimension('d1', 'v2')]), [first.record]);
    assert.deepEqual(next.record.changes, { against: { id: 'i1', name: 'Issue' }, added: [], removed: [{ number: 'A-101', title: 'Sheet A-101' }], changed: [{ number: 'A-102', title: 'Sheet A-102' }] });
    assert.deepEqual(readIssues(JSON.parse(JSON.stringify([first.record, next.record]))), [first.record, next.record]);
  });

  it('reads a record from before this: no changes, no sheet ids', () => {
    const old = JSON.parse(JSON.stringify(issueOf(SET).record));
    for (const r of old.sheets) delete r.sheetId;
    assert.equal(readIssues([old])[0].changes, undefined);
  });

  it('adds a Change column (New, Changed, Removed) only when the issue was compared', () => {
    const first = issueOf(SET);
    assert.deepEqual(drawingListRows(first.plan, { ...labels, change }).at(0)?.includes('Change'), false);
    const next = issueOf(SET.slice(1), sources([dimension('d1', 'v2')]), [first.record]);
    const rows = drawingListRows(next.plan, { ...labels, change });
    assert.equal(rows[0].at(-1), 'Change');
    assert.deepEqual(rows.slice(1).map((r) => [r[0], r.at(-1)]), [['A-102', 'Changed'], ['A-103', ''], ['A-101', 'Removed']]);
    assert.match(drawingListCsv(next.plan, { ...labels, change }), /A-101,.*,Removed\r\n/);
  });
});

describe('Add a revision to the changed sheets', () => {
  beforeEach(() => { resetProject(); clearDraftHistory(); });

  it('adds one revision to exactly the sheets given, dated with the issue, in one undo step', () => {
    useProjectStore.setState({ sheets: SET, revisions: [] });
    clearDraftHistory();
    const id = addRevisionToSheets(['s1', 's3'], '2026-11-02');
    const state = useProjectStore.getState();
    assert.equal(state.revisions?.length, 1);
    assert.equal(state.revisions?.[0].id, id);
    assert.equal(state.revisions?.[0].date, '2026-11-02');
    assert.deepEqual(state.sheets.map((s) => s.revisionIds ?? []), [[id], [], [id]]);
    assert.equal(undoDrafts(), true);
    const undone = useProjectStore.getState();
    assert.deepEqual(undone.revisions ?? [], []);
    assert.deepEqual(undone.sheets.map((s) => s.revisionIds ?? []), [[], [], []]);
    assert.equal(undoDrafts(), false, 'it was a single step');
  });

  it('does nothing for no sheets', () => {
    useProjectStore.setState({ sheets: SET, revisions: [] });
    assert.equal(addRevisionToSheets([], '2026-11-02'), null);
    assert.deepEqual(useProjectStore.getState().revisions ?? [], []);
  });
});
