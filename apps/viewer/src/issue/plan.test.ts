/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet, ProjectView } from '@/project/types.js';
import type { DraftEntity } from '@/drafting/types.js';
import { sectionReferenceDrafts } from '@/drafting/cross-ref-marks.js';
import { sectionSymbolShapes } from '@/drafting/section-symbol.js';
import { issueRecord, nextIssueName, planIssue, scaleText } from './plan.js';
import { readIssues } from './file.js';
import { sheetFingerprint } from '@/project/sheet-fingerprint.js';
import { drawingListCsv, uniqueNames } from './output.js';

const vp = (viewId: string, scale: number) => ({ id: `vp-${viewId}-${scale}`, viewId, x: 0, y: 0, scale, width: 0, height: 0, center: null });
const sheet = (id: string, number: string, name: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name, createdAt: 1, viewports: [vp('v1', 50)], ...extra });
const none = { documents: [{ id: 'v1', createdAt: 1 }], drafts: [], views: [], sheets: [] };
const input = { name: 'Planning', date: '2026-10-13', listFirst: true };
const labels = { title: 'Drawing list', issue: 'Issue', date: 'Date', sheet: 'Sheet', sheetTitle: 'Title', scale: 'Scale', paper: 'Paper', revision: 'Revision', landscape: 'landscape', portrait: 'portrait', drawingList: 'drawing list' };

describe('planning an issue', () => {
  it('orders sheets by number, naturally', () => {
    const plan = planIssue([sheet('a', 'A-10', 'Ten'), sheet('b', 'A-9', 'Nine'), sheet('c', 'A-101', 'Plan'), sheet('d', 'a-2', 'Two')], none, input);
    assert.deepEqual(plan.sheets.map((s) => s.row.number), ['a-2', 'A-9', 'A-10', 'A-101']);
  });

  it('lists number, title, scale, paper and revision, and leaves out a sheet with nothing on it', () => {
    const plan = planIssue([
      sheet('a', 'A-101', 'Ground floor', { paper: 'A2', orientation: 'portrait', revisionIds: ['rc'], viewports: [vp('v1', 100), vp('v1', 50), vp('v1', 100)] }),
      sheet('b', 'A-102', 'Blank', { viewports: [] }),
    ], { ...none, revisions: [{ id: 'rc', code: 'C', date: '', description: '', by: '' }] }, input);
    assert.deepEqual(plan.sheets.map((s) => ({ ...s.row, fingerprint: '' })), [{ number: 'A-101', title: 'Ground floor', scale: 'As indicated', paper: 'A2', orientation: 'portrait', revision: 'C', fingerprint: '', fingerprintVersion: 2, sheetId: 'a' }]);
    assert.equal(plan.leftOut.length, 1);
    assert.equal(plan.leftOut[0].reason.key, 'issue.reason.empty');
    assert.equal(scaleText({ viewports: [] }), '');
    assert.equal(scaleText({ viewports: [vp('v1', 100), vp('v1', 100)] }), '1:100');
  });

  it('reads each sheet\'s revision as its latest one, and none for a sheet without', () => {
    const records = ['A', 'B', 'C'].map((code) => ({ id: `r${code}`, code, date: '', description: '', by: '' }));
    const plan = planIssue([sheet('a', 'A-101', 'Plan', { revisionIds: ['rC', 'rA'] }), sheet('b', 'A-102', 'Other', { revisionIds: ['rB'] }), sheet('c', 'A-103', 'Bare')], { ...none, revisions: records }, input);
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

  // #294: the number is the identity, not the words, so a language switch does not restart or repeat the count.
  it('counts issues across a language switch', () => {
    const templates = ['Emitere {n}', 'Issue {n}'];
    const nameFor = (n: number) => `Emitere ${n}`;
    assert.equal(nextIssueName([{ name: 'Issue 1' }], nameFor, templates), 'Emitere 2');
    assert.equal(nextIssueName([{ name: 'Issue 1' }, { name: 'Emitere 2' }], (n) => `Issue ${n}`, ['Issue {n}', 'Emitere {n}']), 'Issue 3');
    // The number 2 was used in the other language: it is not handed out again.
    assert.equal(nextIssueName([{ name: 'Emitere 2' }], (n) => `Issue ${n}`, ['Issue {n}', 'Emitere {n}']), 'Issue 3');
    // Two issues, the second named by hand: the next default must still not repeat the first's number.
    assert.equal(nextIssueName([{ name: 'Emitere 2' }, { name: 'P01' }], (n) => `Issue ${n}`, ['Issue {n}', 'Emitere {n}']), 'Issue 3');
  });
});

describe('the fingerprint of a sheet', () => {
  const s = sheet('a', 'A-101', 'Plan');
  it('changes when what the sheet holds changes, and not when it was made', () => {
    const base = sheetFingerprint(s, none);
    assert.equal(sheetFingerprint({ ...s, createdAt: 99 }, none), base);
    assert.notEqual(sheetFingerprint({ ...s, viewports: [vp('v1', 100)] }, none), base);
    assert.notEqual(sheetFingerprint(s, { ...none, documents: [{ id: 'v1', name: 'changed' } as never] }), base);
    assert.notEqual(sheetFingerprint(s, { ...none, drafts: [{ id: 'd', viewId: 'v1', layerId: '0', shape: { type: 'line' }, params: {} }] as never }), base);
    assert.match(base, /^[0-9a-f]{14}$/);
  });
});

// Review of #134: renumbering A-201 to A-205 reprints A-101's section mark "1 / A-201" as "1 / A-205", so A-101 changed.
describe('the fingerprint of a sheet whose marks name other sheets', () => {
  const views = [
    { id: 'plan', kind: 'plan', name: 'Ground', level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, auto: false, createdAt: 0 },
    { id: 'sec', kind: 'section', name: 'A', plane: { axis: 'side', offset: 0, flipped: false }, createdAt: 0 },
    { id: 'e-south', kind: 'elevation', name: 'South', direction: 'south', createdAt: 0 },
  ] as ProjectView[];
  // Section A's symbol on the plan: its line and its two letters, linked to the section view.
  const symbol: DraftEntity[] = sectionSymbolShapes({ x: 6, y: -2 }, { x: 6, y: 12 }, { x: 8, y: 5 }, 'A', 0.35)
    .map((shape, i) => ({ id: `sym${i}`, viewId: 'plan', layerId: '0', shape, params: { sectionOf: 'sec' } }));
  const vpOf = (viewId: string) => ({ id: `vp-${viewId}`, viewId, x: 100, y: 100, scale: 100, width: 0, height: 0, center: null });
  const plans = sheet('s1', 'A-101', 'Plans', { viewports: [vpOf('plan')] });
  const sections = sheet('s2', 'A-201', 'Sections', { viewports: [vpOf('sec')] });
  const elevations = sheet('s3', 'A-301', 'Elevations', { viewports: [vpOf('e-south')] });
  const other = sheet('s4', 'A-901', 'Other', { viewports: [] });
  const sourcesWith = (sheets: ProjectSheet[]) => ({ documents: views, drafts: symbol, views, sheets });
  const all = [plans, sections, elevations, other];
  const fingerprintAfter = (renumber: ProjectSheet, to: string) => {
    const sheets = all.map((x) => (x.id === renumber.id ? { ...x, number: to } : x));
    return sheetFingerprint(plans, sourcesWith(sheets));
  };

  it('changes when the sheet a section mark names is renumbered', () => {
    const reference = (sheets: ProjectSheet[]) => sectionReferenceDrafts(symbol, views, sheets).map((d) => (d.shape.type === 'text' ? d.shape.text : ''));
    assert.deepEqual([...new Set(reference(all))], ['1 / A-201']);
    assert.deepEqual([...new Set(reference(all.map((x) => (x.id === 's2' ? { ...x, number: 'A-205' } : x))))], ['1 / A-205']);
    assert.notEqual(fingerprintAfter(sections, 'A-205'), sheetFingerprint(plans, sourcesWith(all)));
  });

  it('changes when the sheet an elevation mark on the ground plan names is renumbered', () => {
    assert.notEqual(fingerprintAfter(elevations, 'A-305'), sheetFingerprint(plans, sourcesWith(all)));
  });

  it('does not change when a sheet no mark names is renumbered', () => {
    assert.equal(fingerprintAfter(other, 'A-902'), sheetFingerprint(plans, sourcesWith(all)));
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

  it('keeps file names apart', () => {
    assert.deepEqual(uniqueNames(['a.svg', 'A.svg', 'b.svg']), ['a.svg', 'A (2).svg', 'b.svg']);
  });
});
