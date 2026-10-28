/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The handover package (#83), built by the real issue: a project of three sheets, two schedules and one IFC is issued as a package and
 * the ZIP is opened. Its file list is the names the pattern gives; the PDF has a page of text per sheet, each workbook opens with the right
 * rows, the IFC is the input byte for byte, and each DXF reads as a DXF. The pattern's edge cases and an old project (no pattern) follow.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as jspdf from 'jspdf';
import { unzipSync } from 'fflate';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { addProjectView, loadProjectDocument, projectDocument, resetProject, setHandoverPattern, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { openPdf } from '@/test/pdf-read.js';
import type { ExportLabelSet } from '@/components/viewer/wall/schedule-export-read';
import { scheduleWorkbooks } from './handover-collect.js';
import { buildHandover } from './handover.js';
import { planFor, runIssue } from './run.js';

const vp = (id: string, viewId: string, y: number) => ({ id, viewId, x: 100, y, scale: 100, width: 150, height: 60, center: null });
const sheet = (id: string, number: string, name: string, viewId: string, extra: Partial<ProjectSheet> = {}): ProjectSheet =>
  ({ id, number, name, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [vp(`p-${id}`, viewId, 100)], ...extra }) as unknown as ProjectSheet;

const WALL = [{ x: -2, y: -0.15 }, { x: 2, y: -0.15 }, { x: 2, y: 0.15 }, { x: -2, y: 0.15 }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: WALL.map((a, i) => ({ line: { start: a, end: WALL[(i + 1) % 4] }, category: 'cut', visibility: 'visible', entityId: 7, ifcType: 'IfcWall', modelIndex: 0, depth: 0 })),
  cutPolygons: [{ polygon: { outer: WALL, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: -2, y: -0.15 }, max: { x: 2, y: 0.15 } },
  stats: { cutLineCount: 4, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;

/** Bytes that are not text and not valid UTF-8, so any re-encoding of the IFC shows. */
const IFC_BYTES = Uint8Array.from({ length: 4096 }, (_, i) => (i * 37 + 11) % 256);
const REGISTER_LABELS = { title: 'Register', number: 'Number', sheetTitle: 'Title', scale: 'Scale', revision: 'Rev', date: 'Date' };
const LABELS = { register: REGISTER_LABELS, asIndicated: 'As indicated' } as unknown as ExportLabelSet;

function project(): void {
  resetProject();
  const view = addProjectView({ kind: 'plan', name: 'Plan', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  useViewDrawings.setState({ byView: { [view]: { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' } } });
  useProjectStore.setState({
    name: 'Casa Mare',
    sheets: [sheet('s1', 'A-101', 'Ground floor', view), sheet('s2', 'A-102', 'Second floor', view), sheet('s3', 'A-201', 'Elevations', view)],
    schedules: [{ id: 'r1', name: 'Drawing register', kind: 'register', createdAt: 0 }, { id: 'r2', name: 'Register, for the authority', kind: 'register', createdAt: 0 }],
  });
  useViewerStore.setState({ models: new Map([['m1', { name: 'Haus.ifc', visible: true, ifcDataStore: { source: { materialize: () => IFC_BYTES, length: IFC_BYTES.length } } }]]) } as never);
}

const loadFont = (url: string) => Promise.resolve(new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url))));
const realFetch = globalThis.fetch;

/** The package of the open project, issued for real. */
async function handedOver() {
  const result = await runIssue({ format: 'handover', name: 'Issue 1', date: '2026-10-25', listFirst: false, handoverSchedules: () => scheduleWorkbooks(LABELS) });
  assert.ok(result.zip, result.lines.map((l) => l.key).join());
  return { result, entries: unzipSync(result.zip) };
}

/** The group codes of a DXF as [code, value] pairs; throws on a file that is not pairs of lines. */
function dxfPairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  assert.equal(lines.length % 2, 0, 'DXF is pairs of lines');
  const pairs: [number, string][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i].trim(), /^\d+$/, `group code at line ${i + 1}`);
    pairs.push([Number(lines[i]), lines[i + 1].trim()]);
  }
  return pairs;
}

beforeEach(() => {
  project();
  window.jspdf = jspdf as never;
  globalThis.fetch = (async (url: unknown) => {
    const bytes = await loadFont(String(url));
    return new Response(bytes as BodyInit, { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  useViewerStore.setState({ models: new Map() } as never);
  resetProject();
});

declare global { interface Window { jspdf?: unknown } }

describe('the handover package of an issue', () => {
  it('holds exactly the files the pattern names: PDF, a DXF per sheet, the IFC, every schedule, the drawing list', async () => {
    const { entries, result } = await handedOver();
    assert.deepEqual(Object.keys(entries).sort(), [
      'A-101 Ground floor.dxf', 'A-102 Second floor.dxf', 'A-201 Elevations.dxf', 'Drawing register.xlsx', 'Haus.ifc', 'Issue 1 drawing list.xlsx', 'Issue 1.pdf',
      'Register for the authority.xlsx',
    ].sort());
    assert.deepEqual(result.files?.slice().sort(), Object.keys(entries).sort());
    assert.equal(useProjectStore.getState().issues?.length, 1, 'the handover is an issue, recorded with the project');
  });

  it('carries the IFC byte for byte', async () => {
    const { entries } = await handedOver();
    assert.ok(Buffer.from(entries['Haus.ifc']).equals(Buffer.from(IFC_BYTES)));
  });

  it('has a PDF with a page of text per sheet', async () => {
    const { entries } = await handedOver();
    const { pdf, close } = await openPdf(entries['Issue 1.pdf']);
    try {
      assert.equal(pdf.numPages, 3);
      for (const [i, number] of ['A-101', 'A-102', 'A-201'].entries()) {
        const text = (await (await pdf.getPage(i + 1)).getTextContent()).items.map((t) => ('str' in t ? t.str : '')).join(' ');
        assert.ok(text.includes(number), `page ${i + 1}: ${text}`);
      }
    } finally { await close(); }
  });

  it('has DXFs that read as DXF, with the text of the sheet in them', async () => {
    const { entries } = await handedOver();
    for (const name of ['A-101 Ground floor.dxf', 'A-102 Second floor.dxf', 'A-201 Elevations.dxf']) {
      const pairs = dxfPairs(new TextDecoder().decode(entries[name]));
      assert.deepEqual(pairs.at(-1), [0, 'EOF'], name);
      const from = pairs.findIndex((p, i) => p[0] === 2 && p[1] === 'ENTITIES' && pairs[i - 1]?.[1] === 'SECTION');
      assert.ok(from > 0, `${name} has an ENTITIES section`);
      const entities = pairs.slice(from, pairs.findIndex((p, i) => i > from && p[0] === 0 && p[1] === 'ENDSEC'));
      assert.ok(entities.some((p) => p[0] === 0 && p[1] === 'TEXT'), `${name} has the sheet's text`);
      assert.ok(entities.some((p) => p[0] === 1 && p[1].includes(name.slice(0, 5))), `${name} carries its own sheet number`);
    }
  });

  it('has workbooks that open with the rows of the tables', async () => {
    const { entries } = await handedOver();
    const ExcelJS = (await import('exceljs')).default;
    const rowsOf = async (name: string) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(entries[name].buffer.slice(entries[name].byteOffset, entries[name].byteOffset + entries[name].byteLength) as ArrayBuffer);
      const rows: string[][] = [];
      wb.worksheets[0].eachRow((r) => rows.push((r.values as unknown[]).slice(1).map((v) => String(v ?? ''))));
      return rows;
    };
    const list = await rowsOf('Issue 1 drawing list.xlsx');
    assert.deepEqual(list.map((r) => r[0]), ['Drawing list', 'Sheet', 'A-101', 'A-102', 'A-201']);
    assert.deepEqual(list[2].slice(0, 2), ['A-101', 'Ground floor']);
    assert.equal(list[2][5], 'Issue 1');
    for (const name of ['Drawing register.xlsx', 'Register for the authority.xlsx']) {
      const rows = await rowsOf(name);
      assert.deepEqual(rows.filter((r) => /^A-\d+$/.test(r[0])).map((r) => r[0]), ['A-101', 'A-102', 'A-201'], name);
    }
  });

  it('names the files by the stored pattern, with the issue\'s revision and date', async () => {
    useProjectStore.setState({ revisions: [{ id: 'rev-a', code: 'A', date: '2026-09-01', description: 'First', by: 'PC' }], sheets: useProjectStore.getState().sheets.map((s) => (s.id === 's1' ? { ...s, revisionIds: ['rev-a'] } : s)) });
    setHandoverPattern('{project} {number} {sheet} rev {revision} {date}');
    const { entries } = await handedOver();
    assert.ok('Casa Mare A-101 Ground floor rev A 2026-10-25.dxf' in entries, Object.keys(entries).join(' | '));
    assert.ok('Casa Mare A-102 Second floor rev 2026-10-25.dxf' in entries, 'a sheet with no revision leaves the token out');
    assert.ok('Casa Mare Issue 1 rev 2026-10-25.pdf' in entries, 'a file of the whole set has no number or revision; the words around the tokens stay');
  });
});

describe('the names, with the app\'s sheets', () => {
  const src = (pattern: string | undefined, sheets: [string, string][]) => {
    useProjectStore.setState({ sheets: sheets.map(([n, t], i) => sheet(`x${i}`, n, t, 'v')) });
    const plan = planFor({ name: 'Issue 1', date: '2026-10-25', listFirst: false });
    const dxfs = new Map(plan.sheets.map((s) => [s.sheet.id, new Uint8Array([1])]));
    return buildHandover({ pattern, project: 'Casa', plan, pdf: new Uint8Array([2]), dxfs, models: [], schedules: [], register: { name: 'Issue 1 drawing list', xlsx: new Uint8Array([3]) } }).files.map((f) => f.name);
  };
  const withDrawing = (): void => { useViewDrawings.setState({ byView: { v: { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' } } }); };

  it('folds diacritics and drops path separators', () => {
    withDrawing();
    const names = src('{number} {sheet}', [['A/101', 'Secțiune \\ longitudinală: Ștefan'], ['..', 'Etaj ../../1']]);
    for (const n of names) assert.match(n, /^[A-Za-z0-9][A-Za-z0-9._ ()-]*\.(dxf|pdf|xlsx)$/, n);
    assert.ok(names.some((n) => n.startsWith('A-101 Sectiune - longitudinala- Stefan')), names.join(' | '));
  });

  it('puts (2) on a name two sheets share, and keeps long names inside the limit', () => {
    withDrawing();
    const same = src('{sheet}', [['A-1', 'Plan'], ['A-2', 'Plan'], ['A-3', 'plan']]);
    assert.deepEqual(same.filter((n) => n.endsWith('.dxf')), ['Plan.dxf', 'Plan (2).dxf', 'plan (3).dxf']);
    const long = src('{number} {sheet}', [['A-1', 'x'.repeat(300)], ['A-2', 'x'.repeat(300)]]);
    assert.ok(long.every((n) => n.length <= 100), long.map((n) => n.length).join());
    assert.equal(new Set(long.map((n) => n.toLowerCase())).size, long.length);
  });

  it('uses the default for an old project: no pattern in the file, none written back', () => {
    const old = JSON.parse(readFileSync(new URL('../project/fixtures/pre-section-cuts.ifclite-project.json', import.meta.url), 'utf8'));
    assert.ok(!('handoverPattern' in old));
    loadProjectDocument(parseProjectFile(JSON.stringify(old)));
    assert.equal(useProjectStore.getState().handoverPattern, undefined);
    assert.ok(!serializeProject(projectDocument()).includes('handoverPattern'));
    withDrawing();
    assert.ok(src(undefined, [['A-101', 'Ground floor']]).includes('A-101 Ground floor.dxf'));
  });

  it('keeps the pattern with the project and reads back only a usable one', () => {
    setHandoverPattern('{number}_{sheet}');
    const text = serializeProject(projectDocument());
    assert.equal(JSON.parse(text).handoverPattern, '{number}_{sheet}');
    resetProject();
    loadProjectDocument(parseProjectFile(text));
    assert.equal(useProjectStore.getState().handoverPattern, '{number}_{sheet}');
    setHandoverPattern('   ');
    assert.equal(useProjectStore.getState().handoverPattern, undefined);
    const bad = parseProjectFile(JSON.stringify({ ...JSON.parse(text), handoverPattern: 7 }));
    assert.equal(bad.handoverPattern, undefined);
  });
});
