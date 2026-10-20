/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawing the sheets of an issue: a view whose generation fails stops the wait at once and is named, a view that
 * never finishes is given up on after the wait, and the other sheets are still tried.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { captureSheets, failureLine } from './capture.js';
import { runIssue } from './run.js';

const sheet = (id: string, number: string, viewId: string): ProjectSheet => ({ id, number, name: number, createdAt: 0, viewports: [{ id: `vp-${id}`, viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }) as unknown as ProjectSheet;
const plan = (name: string) => addProjectView({ kind: 'plan', name, level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
const entry = (status: 'ready' | 'error' | 'generating', error: string | null = null) => ({ ...EMPTY_VIEW_DRAWING, status, error });

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
});

describe('captureSheets', () => {
  it('stops waiting when a view\'s generation fails, and says which sheet and view and why', async () => {
    const v = plan('Ground floor');
    useViewDrawings.setState({ byView: { [v]: entry('error', 'out of memory') } });
    const started = Date.now();
    const out = await captureSheets([sheet('s1', 'A-101', v)], { waitMs: 5000 });
    assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms: it did not hold for the wait`);
    assert.equal(out.failed.length, 1);
    assert.deepEqual([out.failed[0].sheet.number, out.failed[0].reason, out.failed[0].view, out.failed[0].message], ['A-101', 'error', 'Ground floor', 'out of memory']);
    assert.deepEqual(failureLine(out.failed[0]), { key: 'issue.msg.viewError', params: { number: 'A-101', view: 'Ground floor', message: 'out of memory', seconds: 120 } });
  });

  it('gives up on a view that never finishes, once the wait is over', async () => {
    const v = plan('Roof');
    useViewDrawings.setState({ byView: { [v]: entry('generating') } });
    const started = Date.now();
    const out = await captureSheets([sheet('s1', 'A-102', v)], { waitMs: 400 });
    assert.ok(Date.now() - started >= 400);
    assert.deepEqual(out.failed.map((f) => [f.sheet.number, f.reason, f.view]), [['A-102', 'timeout', 'Roof']]);
    assert.equal(failureLine(out.failed[0], 400).key, 'issue.msg.viewTimeout');
  });

  it('reports every sheet that failed, not only the first', async () => {
    const a = plan('One');
    const b = plan('Two');
    useViewDrawings.setState({ byView: { [a]: entry('error', 'x'), [b]: entry('error', 'y') } });
    const out = await captureSheets([sheet('s1', 'A-101', a), sheet('s2', 'A-102', b)], { waitMs: 5000 });
    assert.deepEqual(out.failed.map((f) => f.sheet.number), ['A-101', 'A-102']);
    assert.ok(useProjectStore.getState().views.length === 2);
  });
});

describe('runIssue when a sheet cannot be drawn', () => {
  it('names the sheet, the view and the reason, says nothing was issued, and records nothing', async () => {
    const v = plan('Ground floor');
    useProjectStore.setState({ sheets: [sheet('s1', 'A-101', v)] });
    useViewDrawings.setState({ byView: { [v]: entry('error', 'out of memory') } });
    const result = await runIssue({ format: 'pdf', name: 'P01', date: '2026-10-13' });
    const keys = result.lines.map((l) => l.key);
    assert.ok(keys.includes('issue.msg.viewError'), keys.join());
    assert.equal(keys.at(-1), 'issue.msg.notIssued');
    assert.equal(result.html, null);
    assert.deepEqual(useProjectStore.getState().issues ?? [], []);
  });
});

describe('runIssue as DXF with a view printed as an image (PR #130 review)', () => {
  it('says the image is left out of that sheet, naming it, instead of issuing an empty frame silently', async () => {
    const v = plan('Ground floor');
    const persp = addProjectView({ kind: '3d', name: 'Street view', viewpoint: null, projection: 'perspective' });
    const axo = addProjectView({ kind: '3d', name: 'Axo', viewpoint: null, projection: 'axonometric', preset: 'se' });
    const s1 = sheet('s1', 'A-101', v);
    const withViews = { ...s1, viewports: [...s1.viewports!, { ...s1.viewports![0], id: 'vp-p', viewId: persp }, { ...s1.viewports![0], id: 'vp-a', viewId: axo }] } as ProjectSheet;
    useProjectStore.setState({ sheets: [withViews] });
    useViewDrawings.setState({ byView: { [v]: entry('error', 'out of memory') } });
    const dxf = await runIssue({ format: 'dxf', name: 'P01', date: '2026-10-13' });
    const said = dxf.lines.filter((l) => l.key === 'issue.msg.dxfRaster');
    assert.deepEqual(said.map((l) => l.params), [{ number: 'A-101', views: 'Street view' }], 'the vector axonometric is not named');
    const pdf = await runIssue({ format: 'pdf', name: 'P01', date: '2026-10-13' });
    assert.ok(!pdf.lines.some((l) => l.key === 'issue.msg.dxfRaster'), 'a PDF carries the image');
  });
});
