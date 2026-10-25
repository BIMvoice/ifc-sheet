/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fingerprint's version (#335): the revision clouds WHATCHANGED draws do not make a sheet "edited" (version 2),
 * clouds drawn by hand still do, and a record is compared by the version it was made with, so sheets unchanged since
 * an issue made before versions existed do not read as edited.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftEntity } from '@/drafting/types.js';
import { cloudDraft } from '@/whatchanged/cloud.js';
import { REVISION_ID_PARAM, REVISION_STAMP } from '@/project/revisions.js';
import { FINGERPRINT_VERSION, sheetFingerprint } from '@/project/sheet-fingerprint.js';
import type { ProjectIssue, ProjectSheet } from '@/project/types.js';
import { readIssues } from './file.js';
import type { ModelImpact } from './model-state.js';
import { issueRecord, planIssue } from './plan.js';

const vp = { id: 'vp', viewId: 'v1', x: 0, y: 0, scale: 50, width: 0, height: 0, center: null };
const SHEET: ProjectSheet = { id: 's1', number: 'A-101', name: 'Plan', createdAt: 1, viewports: [vp] };
const documents = [{ id: 'v1', createdAt: 1 }];
const revisions = [{ id: 'rv', code: 'A', date: '', description: '', by: '' }];
const sources = (drafts: DraftEntity[] = []) => ({ documents, drafts, views: [], sheets: [], revisions });
const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
const automatic = (): DraftEntity => cloudDraft('v1', box, 1, { revision: REVISION_STAMP, [REVISION_ID_PARAM]: 'rv' });
const byHand = (): DraftEntity => cloudDraft('v1', box, 1, { [REVISION_ID_PARAM]: 'rv' });
const input = { name: 'Issue', date: '2026-10-25', listFirst: true };
const modelChanged: ModelImpact = { status: 'compared', sheetIds: new Set(['s1']) };

const issue = (drafts: DraftEntity[], issues: ProjectIssue[] = [], model?: ModelImpact) => {
  const plan = planIssue([SHEET], sources(drafts), input, undefined, { issues, model });
  return { plan, record: issueRecord(plan, `i${issues.length + 1}`, issues.length + 1) };
};
/** An issue as one made before fingerprints had versions: version 1 over the drafts it had, no version field. */
const legacy = (drafts: DraftEntity[]): ProjectIssue => {
  const { record } = issue(drafts);
  const { fingerprintVersion: _v, ...row } = record.sheets[0];
  return { ...record, sheets: [{ ...row, fingerprint: sheetFingerprint(SHEET, sources(drafts), 1) }] };
};

describe('fingerprint version', () => {
  it('stores version 2 on a new issue', () => {
    const { record } = issue([]);
    assert.equal(FINGERPRINT_VERSION, 2);
    assert.equal(record.sheets[0].fingerprintVersion, 2);
    assert.equal(readIssues(JSON.parse(JSON.stringify([record])))[0].sheets[0].fingerprintVersion, 2);
  });

  it('reads a model update that only adds automatic clouds as "model changed", not "edited"', () => {
    const first = issue([]);
    const next = issue([automatic()], [first.record], modelChanged);
    assert.deepEqual(next.plan.changes.changed.map((c) => c.reasons), [['model']]);
  });

  it('still reads a hand-drawn cloud as "edited"', () => {
    const first = issue([]);
    const next = issue([byHand()], [first.record], modelChanged);
    assert.deepEqual(next.plan.changes.changed.map((c) => c.reasons), [['edited', 'model']]);
  });

  it('compares a version 1 record by version 1: a sheet unchanged since, with old automatic clouds, is not edited', () => {
    const clouds = [automatic()];
    const old = legacy(clouds);
    assert.equal(old.sheets[0].fingerprintVersion, undefined);
    const next = issue(clouds, [old]);
    assert.deepEqual(next.plan.changes.changed, []);
    // and version 1 still sees an automatic cloud added since as an edit
    assert.deepEqual(issue(clouds, [legacy([])]).plan.changes.changed.map((c) => c.reasons), [['edited']]);
  });

  it('keeps the version of a record read back from a file', () => {
    const clouds = [automatic()];
    const back = readIssues(JSON.parse(JSON.stringify([legacy(clouds)])))[0];
    assert.equal(back.sheets[0].fingerprintVersion, undefined);
    assert.deepEqual(issue(clouds, [back]).plan.changes.changed, []);
    const v2 = readIssues(JSON.parse(JSON.stringify([issue(clouds).record])))[0];
    assert.equal(v2.sheets[0].fingerprintVersion, 2);
  });
});
