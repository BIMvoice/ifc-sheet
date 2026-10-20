/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Revisions: a sheet's revisions are the ones its clouds name plus the ones chosen for it, its title block reads
 * the latest, a project that typed the revision into the title block keeps it as a record, and all of it is
 * saved with the project.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cancelCommand, clickDrawing, attachDraftingView, startDraftCommand } from '@/drafting/session';
import { cloudDraft } from '@/whatchanged/cloud';
import { parseProjectFile, serializeProject } from './project-file';
import { addRevision, nextRevisionCode, removeRevision, updateRevision } from './revision-actions';
import { chooseCloudRevision } from './revision-tool';
import { cloudRevisionId, currentRevisionOf, liftTypedRevisions, REVISION_ID_PARAM, sheetRevisions } from './revisions';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store';
import { addSheetRevision } from './sheets';
import { fingerprintSources } from './sheet-fingerprint';
import { issueRecord, planIssue } from '@/issue/plan';
import type { DraftEntity } from '@/drafting/types';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import type { ProjectDocument, ProjectSheet } from './types';

const sheet = (id: string, number: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: number, createdAt: 0, viewports: [], ...extra });
const BOX = { x0: 10, y0: 10, x1: 60, y1: 40 };
const cloudOn = (viewId: string, revisionId: string): DraftEntity => cloudDraft(viewId, BOX, 1, { [REVISION_ID_PARAM]: revisionId });

/** The demo set's two sheets and its revisions A and B: A-101 has a cloud of B and A chosen, A-201 has A chosen. */
function demoSet(): void {
  resetProject();
  useProjectStore.setState({
    sheets: [sheet('s101', 'A-101', { revisionIds: ['rev-a'] }), sheet('s201', 'A-201', { revisionIds: ['rev-a'] })],
    revisions: [
      { id: 'rev-a', code: 'A', date: '2026-09-01', description: 'First issue', by: 'PC' },
      { id: 'rev-b', code: 'B', date: '2026-10-12', description: 'Walls moved', by: 'IC' },
    ],
    drafts: [cloudOn('s101', 'rev-b')],
  });
}

const read = (id: string) => {
  const s = useProjectStore.getState();
  const found = s.sheets.find((x) => x.id === id)!;
  return { list: sheetRevisions(found, s).map((r) => r.code), current: currentRevisionOf(found, s)?.code ?? null };
};

describe('a sheet\'s revisions', () => {
  beforeEach(demoSet);

  it('are the ones its clouds name and the ones chosen for it: A-101 lists A and B and reads B, A-201 reads A', () => {
    assert.deepEqual(read('s101'), { list: ['A', 'B'], current: 'B' });
    assert.deepEqual(read('s201'), { list: ['A'], current: 'A' });
  });

  it('count a cloud on a view placed on the sheet, and not a cloud on a view that is not', () => {
    useProjectStore.setState({
      sheets: [sheet('s301', 'A-301', { viewports: [{ id: 'vp', viewId: 'v-plan', x: 0, y: 0, scale: 50, width: 0, height: 0, center: null }] })],
      drafts: [cloudOn('v-plan', 'rev-b'), cloudOn('v-elsewhere', 'rev-a')],
    });
    assert.deepEqual(read('s301'), { list: ['B'], current: 'B' });
  });

  it('are none for a sheet with neither a cloud nor a choice, and its current revision is none', () => {
    useProjectStore.setState({ sheets: [sheet('s9', 'A-901')] });
    assert.deepEqual(read('s9'), { list: [], current: null });
  });

  it('follow the order of the records, not the order they were chosen or drawn in', () => {
    useProjectStore.setState({ sheets: [sheet('s9', 'A-901', { revisionIds: ['rev-b', 'rev-a'] })], drafts: [] });
    assert.deepEqual(read('s9'), { list: ['A', 'B'], current: 'B' });
  });

  it('give the current revision\'s date too, and the code follows an edit of the record', () => {
    assert.equal(currentRevisionOf(useProjectStore.getState().sheets[0], useProjectStore.getState())?.date, '2026-10-12');
    updateRevision('rev-b', { code: 'C' });
    assert.deepEqual(read('s101'), { list: ['A', 'C'], current: 'C' });
  });

  it('are saved with the project and unchanged after it is loaded again', () => {
    const before = [read('s101'), read('s201')];
    const text = serializeProject(projectDocument());
    resetProject();
    loadProjectDocument(parseProjectFile(text));
    assert.deepEqual([read('s101'), read('s201')], before);
    assert.deepEqual(useProjectStore.getState().revisions?.map((r) => r.description), ['First issue', 'Walls moved']);
  });

  it('can be chosen for a sheet and removed with the revision, clouds included', () => {
    addSheetRevision('s201', 'rev-b');
    assert.deepEqual(read('s201'), { list: ['A', 'B'], current: 'B' });
    removeRevision('rev-b');
    assert.deepEqual(read('s201'), { list: ['A'], current: 'A' });
    assert.deepEqual(read('s101'), { list: ['A'], current: 'A' });
    assert.equal(useProjectStore.getState().drafts.length, 0);
    assert.deepEqual(useProjectStore.getState().sheets[1].revisionIds, ['rev-a']);
  });
});

describe('removing a revision (#133 review)', () => {
  beforeEach(() => { demoSet(); clearDraftHistory(); });

  it('takes the record, its clouds and the sheets\' choice of it in one store write, and one undo brings all back in order', () => {
    useProjectStore.setState({ drafts: [cloudOn('s101', 'rev-b'), cloudOn('s201', 'rev-a')] });
    const before = useProjectStore.getState();
    let writes = 0;
    const stop = useProjectStore.subscribe(() => { writes++; });
    removeRevision('rev-a');
    stop();
    assert.equal(writes, 1);
    const after = useProjectStore.getState();
    assert.deepEqual(after.revisions?.map((r) => r.code), ['B']);
    assert.deepEqual(after.drafts.map(cloudRevisionId), ['rev-b']);
    assert.ok(undoDrafts());
    const back = useProjectStore.getState();
    assert.deepEqual(back.revisions, before.revisions);
    assert.deepEqual(back.drafts.map(cloudRevisionId), ['rev-b', 'rev-a']);
    assert.deepEqual(back.sheets.map((s) => s.revisionIds), [['rev-a'], ['rev-a']]);
    assert.ok(redoDrafts());
    assert.deepEqual(useProjectStore.getState().revisions?.map((r) => r.code), ['B']);
  });
});

describe('a project that typed the revision into the title block', () => {
  const old = (extra: Partial<ProjectDocument> = {}): ProjectDocument => ({
    name: 'P', models: [], views: [], drafts: [], draftLayers: [], titleBlock: { project: 'House', date: '2026-10-12', revision: '02' },
    sheets: [sheet('s1', 'A-101'), sheet('s2', 'A-201', { titleBlock: { revision: '03' } }), sheet('s3', 'A-301', { titleBlock: { revision: '' } })], ...extra,
  });

  beforeEach(() => resetProject());

  it('loads with a record "02" and the sheet reads "02"', () => {
    loadProjectDocument(old());
    const s = useProjectStore.getState();
    assert.deepEqual(s.revisions?.map((r) => r.code), ['02', '03']);
    assert.equal(s.revisions?.[0].date, '2026-10-12');
    assert.equal(currentRevisionOf(s.sheets[0], s)?.code, '02');
  });

  it('gives a sheet that typed its own revision that one, and a sheet that typed none none', () => {
    loadProjectDocument(old());
    const s = useProjectStore.getState();
    assert.equal(currentRevisionOf(s.sheets[1], s)?.code, '03');
    assert.equal(currentRevisionOf(s.sheets[2], s), null);
  });

  it('drops the typed field, so it is kept in one place and a second load adds nothing', () => {
    loadProjectDocument(old());
    const once = projectDocument();
    assert.equal('revision' in (once.titleBlock ?? {}), false);
    assert.equal(once.sheets.some((x) => x.titleBlock && 'revision' in x.titleBlock), false);
    loadProjectDocument(parseProjectFile(serializeProject(once)));
    assert.deepEqual(projectDocument().revisions?.map((r) => r.code), ['02', '03']);
  });

  it('uses a record that already has the code instead of adding another', () => {
    const existing = { id: 'rev-x', code: '02', date: '2026-01-01', description: 'kept', by: '' };
    const lifted = liftTypedRevisions(old({ revisions: [existing] }), () => 'new');
    assert.deepEqual(lifted.revisions?.map((r) => r.id), ['rev-x', 'new']);
    assert.deepEqual(lifted.sheets[0].revisionIds, ['rev-x']);
  });

  it('does not make the next issue read any sheet as changed (#133 review)', () => {
    // Issued before revisions were records: the fingerprints were taken of the project as it was saved.
    const placed = (id: string, number: string, extra: Partial<ProjectSheet> = {}) => sheet(id, number, { viewports: [{ id: `vp-${id}`, viewId: 'v1', x: 0, y: 0, scale: 50, width: 0, height: 0, center: null }], ...extra });
    const saved = old({
      views: [{ id: 'v1', name: 'Plan', kind: 'plan', createdAt: 0, cutHeight: 1.2, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] } }],
      sheets: [placed('s1', 'A-101'), placed('s2', 'A-201', { titleBlock: { revision: '03' } }), placed('s3', 'A-301', { titleBlock: { revision: '' } })],
    });
    const issued = planIssue(saved.sheets, fingerprintSources(saved), { name: 'Issue 1', date: '2026-10-01', listFirst: false });
    loadProjectDocument({ ...saved, issues: [issueRecord(issued, 'i1', 1)] });
    // What the issue run plans with (`issue/run.ts`'s `planFor`): the store's sheets, sources and records.
    const planNow = () => { const s = useProjectStore.getState(); return planIssue(s.sheets, fingerprintSources(s), { name: 'Issue 2', date: '2026-10-20', listFirst: false }, undefined, { issues: s.issues, schedules: s.schedules, revisions: s.revisions }); };
    const next = planNow();
    const was = new Map(useProjectStore.getState().issues?.[0].sheets.map((r) => [r.number, r.fingerprint]));
    assert.deepEqual(next.sheets.map((s) => s.row.number), ['A-101', 'A-201', 'A-301']);
    assert.deepEqual(next.sheets.filter((s) => was.get(s.row.number) !== s.row.fingerprint).map((s) => s.row.number), []);
    // And an edit after the migration still reads as a change.
    updateRevision(useProjectStore.getState().revisions?.[0].id ?? '', { code: 'P02' });
    assert.notEqual(planNow().sheets[0].row.fingerprint, was.get('A-101'));
  });

  it('leaves a document with no typed revision as it is', () => {
    const doc = old({ titleBlock: { project: 'House' }, sheets: [sheet('s1', 'A-101')] });
    assert.equal(liftTypedRevisions(doc, () => 'x'), doc);
  });
});

describe('REVCLOUD', () => {
  beforeEach(() => {
    demoSet();
    cancelCommand();
    chooseCloudRevision(null);
    attachDraftingView('s201', 'down', () => []);
  });
  const draw = () => {
    startDraftCommand('revcloud');
    clickDrawing({ x: 5, y: 5 }, 0.05, false);
    clickDrawing({ x: 45, y: 25 }, 0.05, false);
  };
  const clouds = () => useProjectStore.getState().drafts.filter((d) => d.viewId === 's201');

  it('draws the cloud the WHATCHANGED run draws, for the latest revision by default', () => {
    draw();
    assert.equal(clouds().length, 1);
    assert.equal(cloudRevisionId(clouds()[0]), 'rev-b');
    assert.deepEqual(clouds()[0].shape, cloudDraft('s201', { x0: 5, y0: 5, x1: 45, y1: 25 }, 1).shape);
    assert.deepEqual(read('s201'), { list: ['A', 'B'], current: 'B' });
  });

  it('draws for the revision chosen, and falls back to the latest when that one is gone', () => {
    chooseCloudRevision('rev-a');
    draw();
    assert.equal(cloudRevisionId(clouds()[0]), 'rev-a');
    chooseCloudRevision('rev-gone');
    draw();
    assert.equal(cloudRevisionId(clouds()[1]), 'rev-b');
  });

  it('draws nothing when the project has no revision', () => {
    useProjectStore.setState({ revisions: [], drafts: [] });
    draw();
    assert.equal(clouds().length, 0);
  });
});

describe('revision codes', () => {
  it('count on: A to B, Z to AA, 01 to 02, 9 to 10, none to A', () => {
    assert.deepEqual(['A', 'Z', 'AZ', '01', '9', 'P01', undefined].map(nextRevisionCode), ['B', 'AA', 'BA', '02', '10', 'P02', 'A']);
  });

  it('are added after the last record with the next code', () => {
    demoSet();
    const id = addRevision({}, '2026-11-01');
    assert.deepEqual(useProjectStore.getState().revisions?.at(-1), { id, code: 'C', date: '2026-11-01', description: '', by: '' });
  });
});
