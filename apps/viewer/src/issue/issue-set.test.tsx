/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Issuing the set twice (#331), by the real issue: the chosen date prints in each sheet's title block, on the drawing list and in the
 * file names and is kept with the record; a sheet edited between two issues is the one the second lists as changed, and the list
 * is in the drawing list and in the record.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { addRevisionToSheets } from './changes-actions.js';
import { buildHandover } from './handover.js';
import { planFor, runIssue } from './run.js';
import { todayText } from './plan.js';

const vp = (id: string, viewId: string) => ({ id, viewId, x: 100, y: 100, scale: 100, width: 150, height: 60, center: null });
const sheet = (id: string, number: string, name: string, viewId: string): ProjectSheet =>
  ({ id, number, name, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [vp(`p-${id}`, viewId)] }) as unknown as ProjectSheet;

const WALL = [{ x: -2, y: -0.15 }, { x: 2, y: -0.15 }, { x: 2, y: 0.15 }, { x: -2, y: 0.15 }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: WALL.map((a, i) => ({ line: { start: a, end: WALL[(i + 1) % 4] }, category: 'cut', visibility: 'visible', entityId: 7, ifcType: 'IfcWall', modelIndex: 0, depth: 0 })),
  cutPolygons: [{ polygon: { outer: WALL, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: -2, y: -0.15 }, max: { x: 2, y: 0.15 } },
  stats: { cutLineCount: 4, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;


const edit = (id: string, viewId: string) => ({ id, viewId, layerId: '0', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: {} }) as never;

function project(): string[] {
  resetProject();
  const views = ['One', 'Two', 'Three'].map((name) => addProjectView({ kind: 'plan', name, level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never));
  useViewDrawings.setState({ byView: Object.fromEntries(views.map((v) => [v, { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' }])) });
  useProjectStore.setState({ name: 'Casa', titleBlock: { project: 'Casa', date: '1999-01-01' }, sheets: [sheet('s1', 'A-101', 'Ground', views[0]), sheet('s2', 'A-102', 'Second', views[1]), sheet('s3', 'A-201', 'Roof', views[2])] });
  return views;
}

const issue = (name: string, date?: string) => runIssue({ format: 'svg', name, date, listFirst: false });
const files = (zip: Uint8Array | null) => unzipSync(zip!);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const csvRows = (entries: Record<string, Uint8Array>) => text(entries['drawing-list.csv']).replace(/^\uFEFF/, '').trim().split('\r\n').map((l) => l.split(','));

beforeEach(project);

describe('the issue date', () => {
  it('is today unless one is chosen, and an invalid one reads as today', () => {
    assert.equal(planFor({}).date, todayText());
    assert.equal(planFor({ date: '2026-02-30' }).date, todayText());
    assert.equal(planFor({ date: 'tomorrow' }).date, todayText());
    assert.equal(planFor({ date: '2026-11-03' }).date, '2026-11-03');
  });

  it('prints in the title block of each sheet in place of the title block\'s own date, and on the drawing list and the record', async () => {
    const result = await issue('Issue 1', '2026-11-03');
    const entries = files(result.zip);
    const sheets = Object.entries(entries).filter(([n]) => n.endsWith('.svg'));
    assert.equal(sheets.length, 3);
    for (const [name, data] of sheets) {
      assert.ok(text(data).includes('>2026-11-03</text>'), `${name} carries the chosen date`);
      assert.ok(!text(data).includes('1999-01-01'), `${name} does not carry the title block's date`);
    }
    assert.ok(csvRows(entries).slice(1).every((r) => r.at(-1) === '2026-11-03'), 'the list is dated');
    assert.equal(useProjectStore.getState().issues?.at(-1)?.date, '2026-11-03');
  });

  it('names the files of the handover package through {date}', () => {
    const plan = planFor({ name: 'Issue 1', date: '2026-11-03', listFirst: false });
    const dxfs = new Map(plan.sheets.map((s) => [s.sheet.id, new Uint8Array([1])]));
    const built = buildHandover({ pattern: '{number} {date}', project: 'Casa', plan, pdf: new Uint8Array([2]), dxfs, models: [], schedules: [], register: { name: 'Issue 1 drawing list', xlsx: new Uint8Array([3]) } });
    assert.ok(built.files.some((f) => f.name === 'A-101 2026-11-03.dxf'), built.files.map((f) => f.name).join(' | '));
  });
});

describe('issuing twice with one sheet edited in between', () => {
  it('lists exactly that sheet, in the plan, the drawing list and the record', async () => {
    const [, two] = project();
    await issue('Issue 1', '2026-11-03');
    useProjectStore.setState({ drafts: [edit('d1', two)] });
    assert.deepEqual(planFor({}).changes.changed.map((s) => s.number), ['A-102']);
    const second = await issue('Issue 2', '2026-11-10');
    const rows = csvRows(files(second.zip));
    assert.equal(rows[0].at(-1), 'Change');
    assert.deepEqual(rows.slice(1).map((r) => [r[0], r.at(-1)]), [['A-101', ''], ['A-102', 'Changed'], ['A-201', '']]);
    assert.deepEqual(useProjectStore.getState().issues?.at(-1)?.changes?.changed, [{ number: 'A-102', title: 'Second' }]);
  });

  it('lists nothing when the set is issued again as it was', async () => {
    await issue('Issue 1', '2026-11-03');
    const again = planFor({ date: '2026-11-10' }).changes;
    assert.equal(again.status, 'compared');
    assert.deepEqual([again.added, again.removed, again.changed], [[], [], []]);
  });

  it('offers a revision for the changed sheet, and after it the sheet is changed but not offered again', async () => {
    const [, two] = project();
    await issue('Issue 1', '2026-11-03');
    useProjectStore.setState({ drafts: [edit('d1', two)] });
    assert.deepEqual(planFor({}).changes.unbumped.map((u) => u.number), ['A-102']);
    addRevisionToSheets(planFor({}).changes.unbumped.map((u) => u.sheetId), '2026-11-10');
    const after = planFor({}).changes;
    assert.deepEqual(after.changed.map((s) => s.number), ['A-102']);
    assert.deepEqual(after.unbumped, []);
    const second = await issue('Issue 2', '2026-11-10');
    assert.deepEqual(second.plan.sheets.map((s) => s.row.revision), ['', 'A', '']);
  });

  it('sees a sheet added and a sheet removed', async () => {
    const views = project();
    await issue('Issue 1');
    useProjectStore.setState((s) => ({ sheets: [...s.sheets.slice(1), sheet('s4', 'A-301', 'Sections', views[0])] }));
    const changes = planFor({}).changes;
    assert.deepEqual([changes.added.map((s) => s.number), changes.removed.map((s) => s.number)], [['A-301'], ['A-101']]);
  });
});
