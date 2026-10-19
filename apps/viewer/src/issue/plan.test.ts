/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet } from '@/project/types.js';
import { issueRecord, nextIssueName, planIssue, scaleText } from './plan.js';
import { readIssues } from './file.js';
import { sheetFingerprint } from './fingerprint.js';
import { drawingListCsv, issuePrintHtml, uniqueNames } from './output.js';

const vp = (viewId: string, scale: number) => ({ id: `vp-${viewId}-${scale}`, viewId, x: 0, y: 0, scale, width: 0, height: 0, center: null });
const sheet = (id: string, number: string, name: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name, createdAt: 1, viewports: [vp('v1', 50)], ...extra });
const none = { documents: [{ id: 'v1', createdAt: 1 }], drafts: [] };
const input = { name: 'Planning', date: '2026-10-13', listFirst: true };
const labels = { title: 'Drawing list', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Revision' };

describe('planning an issue', () => {
  it('orders sheets by number, naturally', () => {
    const plan = planIssue([sheet('a', 'A-10', 'Ten'), sheet('b', 'A-9', 'Nine'), sheet('c', 'A-101', 'Plan'), sheet('d', 'a-2', 'Two')], none, input);
    assert.deepEqual(plan.sheets.map((s) => s.row.number), ['a-2', 'A-9', 'A-10', 'A-101']);
  });

  it('lists number, title, scale, paper and revision, and leaves out a sheet with nothing on it', () => {
    const plan = planIssue([
      sheet('a', 'A-101', 'Ground floor', { paper: 'A2', orientation: 'portrait', revisionIds: ['rc'], viewports: [vp('v1', 100), vp('v1', 50), vp('v1', 100)] }),
      sheet('b', 'A-102', 'Blank', { viewports: [] }),
    ], none, input, [{ id: 'rc', code: 'C', date: '', description: '', by: '' }]);
    assert.deepEqual(plan.sheets.map((s) => ({ ...s.row, fingerprint: '' })), [{ number: 'A-101', title: 'Ground floor', scale: '1:50, 1:100', paper: 'A2', orientation: 'portrait', revision: 'C', fingerprint: '' }]);
    assert.equal(plan.leftOut.length, 1);
    assert.equal(plan.leftOut[0].reason.key, 'issue.reason.empty');
    assert.equal(scaleText({ viewports: [] }), '');
  });

  it('reads each sheet\'s revision as its latest one, and none for a sheet without', () => {
    const records = ['A', 'B', 'C'].map((code) => ({ id: `r${code}`, code, date: '', description: '', by: '' }));
    const plan = planIssue([sheet('a', 'A-101', 'Plan', { revisionIds: ['rC', 'rA'] }), sheet('b', 'A-102', 'Other', { revisionIds: ['rB'] }), sheet('c', 'A-103', 'Bare')], none, input, records);
    assert.deepEqual(plan.sheets.map((s) => s.row.revision), ['C', 'B', '']);
  });

  it('keeps a sheet that only has something drawn on its paper', () => {
    const drafts = [{ id: 'd', viewId: 'b', layerId: '0', shape: { type: 'line' }, params: {} }] as never;
    const plan = planIssue([sheet('b', 'A-102', 'Notes', { viewports: [] })], { ...none, drafts }, input);
    assert.equal(plan.sheets.length, 1);
  });

  it('plans the same thing twice', () => {
    const sheets = [sheet('a', 'A-2', 'x'), sheet('b', 'A-1', 'y')];
    assert.deepEqual(planIssue(sheets, none, input), planIssue([...sheets].reverse(), none, input));
  });

  it('names the next issue', () => {
    assert.equal(nextIssueName([]), 'Issue 1');
    assert.equal(nextIssueName([{ name: 'Issue 2' }]), 'Issue 3');
  });
});

describe('the fingerprint of a sheet', () => {
  const s = sheet('a', 'A-101', 'Plan');
  it('changes when what the sheet holds changes, and not when it was made', () => {
    const base = sheetFingerprint(s, none);
    assert.equal(sheetFingerprint({ ...s, createdAt: 99 }, none), base);
    assert.notEqual(sheetFingerprint({ ...s, viewports: [vp('v1', 100)] }, none), base);
    assert.notEqual(sheetFingerprint(s, { documents: [{ id: 'v1', name: 'changed' } as never], drafts: [] }), base);
    assert.notEqual(sheetFingerprint(s, { ...none, drafts: [{ id: 'd', viewId: 'v1', layerId: '0', shape: { type: 'line' }, params: {} }] as never }), base);
    assert.match(base, /^[0-9a-f]{14}$/);
  });
});

describe('what is written and read back', () => {
  const plan = planIssue([sheet('a', 'A-101', 'Plan, "ground"')], none, input);
  const record = issueRecord(plan, 'i1', 5);

  it('reads back what it writes', () => {
    assert.deepEqual(readIssues(JSON.parse(JSON.stringify([record]))), [record]);
  });

  it('refuses a damaged issue with its place', () => {
    const bad = (mutate: (r: Record<string, unknown>) => void) => { const r = JSON.parse(JSON.stringify(record)); mutate(r); return () => readIssues([r]); };
    assert.throws(bad((r) => { r.date = '13/10/2026'; }), /\/issues\/0\/date/);
    assert.throws(bad((r) => { (r.sheets as Record<string, unknown>[])[0].paper = 'B5'; }), /\/issues\/0\/sheets\/0\/paper/);
    assert.throws(bad((r) => { (r.sheets as Record<string, unknown>[])[0].fingerprint = 'xyz'; }), /fingerprint/);
    assert.throws(() => readIssues([record, record]), /used by two issues/);
    assert.throws(() => readIssues({}), /\/issues must be an array/);
    assert.deepEqual(readIssues(undefined), []);
  });

  it('writes the drawing list as CSV with quoting', () => {
    const csv = drawingListCsv(plan, labels);
    assert.equal(csv.split('\r\n')[0], 'Sheet,Title,Scale,Paper,Revision,Issue,Date');
    assert.equal(csv.split('\r\n')[1], 'A-101,"Plan, ""ground""",1:50,A1 landscape,,Planning,2026-10-13');
  });

  it('prints each sheet on a page of its own paper, list first, in order', () => {
    const sheets = [sheet('a', 'A-102', 'B', { paper: 'A3' }), sheet('b', 'A-101', 'A', { paper: 'A2', orientation: 'portrait' })];
    const p = planIssue(sheets, none, input);
    const svgs = new Map(sheets.map((x) => [x.id, `<?xml version="1.0"?>\n<svg id="${x.id}"/>`]));
    const html = issuePrintHtml(p, svgs, 'House', labels);
    assert.match(html, /@page p-420x594\{size:420mm 594mm;margin:0\}/);
    assert.match(html, /@page p-420x297\{size:420mm 297mm;margin:0\}/);
    assert.match(html, /@page list\{size:210mm 297mm/);
    assert.ok(html.indexOf('class="pg list"') < html.indexOf('id="b"') && html.indexOf('id="b"') < html.indexOf('id="a"'));
    assert.equal(issuePrintHtml({ ...p, listFirst: false }, svgs, 'House', labels).includes('class="pg list"'), false);
  });

  it('keeps file names apart', () => {
    assert.deepEqual(uniqueNames(['a.svg', 'A.svg', 'b.svg']), ['a.svg', 'A (2).svg', 'b.svg']);
  });
});
