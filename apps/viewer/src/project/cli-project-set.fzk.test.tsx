/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #479: `ifcsheet build --project` prints the drawing set the app saved, as the app's sheets show it. On AC20-FZK-Haus the Wall lays
 * out its set; a plan's viewport is moved by hand, a dimension and a text are drawn on that plan, and a list schedule is placed on
 * a sheet. The project is saved as the app saves it and built with the command line. Then, against the app's sheet SVG (the one
 * the issue captures, `captureSheets`):
 *   - the PDF has a page per sheet, in the set's order, each printing its sheet's number;
 *   - the dimension's figure and the text are printed at the paper point where the sheet draws them (so the moved viewport is where
 *     it was put);
 *   - every text of the placed schedule (title, header, rows, totals) is printed, at the point the sheet draws it.
 * The engine's own side, without the app, is `packages/ifcsheet/src/project-set.fzk.test.ts`.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup } from '@/test/render.js';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { clearDraftHistory, commitDrafts, newDraft } from '@/drafting/draft-store';
import { captureSheets } from '@/issue/capture';
import { addListScheduleToSet } from '@/joinery/list-schedule-actions';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from './drawing-set-actions';
import { modelLevels } from './model-levels';
import { projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { serializeProject } from './project-file';
import { updateViewport } from './sheets';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from './view-drawings';

const BIN = fileURLToPath(new URL('../../../../packages/ifcsheet/dist/bin.js', import.meta.url));
const MM_PER_PT = 25.4 / 72;
/** How far apart, paper mm, the same text may be on the sheet and in the PDF: a text is placed at a point, and both writers place it there. */
const TOLERANCE = 0.3;

interface Placed { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' }
interface PdfText { text: string; x: number; y: number; w: number }

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
/** An SVG `transform` attribute (the translate and rotate the sheet writes) as a matrix. */
function matrixOf(transform: string | null): M {
  let m: M = [1, 0, 0, 1, 0, 0];
  for (const [, op, args] of (transform ?? '').matchAll(/(translate|rotate)\(([^)]*)\)/g)) {
    const n = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (op === 'translate') m = mul(m, [1, 0, 0, 1, n[0], n[1] ?? 0]);
    else {
      const r = (n[0] * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    }
  }
  return m;
}

/** Every text of `root` with the paper point the sheet draws it at (its transforms applied) and its anchor. */
function placedTexts(root: Element): Placed[] {
  return [...root.querySelectorAll('text')].flatMap((t) => {
    const text = (t.textContent ?? '').trim();
    if (!text) return [];
    let m: M = [1, 0, 0, 1, 0, 0];
    for (let el: Element | null = t; el && el !== root.parentElement; el = el.parentElement) m = mul(matrixOf(el.getAttribute('transform')), m);
    const x = Number(t.getAttribute('x') ?? 0), y = Number(t.getAttribute('y') ?? 0);
    const anchor = (t.getAttribute('text-anchor') ?? 'start') as Placed['anchor'];
    return [{ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5], anchor }];
  });
}

/** The texts of each PDF page with their paper point (mm from the top left) and width. */
async function pdfPages(bytes: Uint8Array): Promise<PdfText[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const pdf = await task.promise;
  try {
    const pages: PdfText[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const height = page.view[3] * MM_PER_PT;
      pages.push((await page.getTextContent()).items.flatMap((item) => ('str' in item && item.str.trim()
        ? [{ text: item.str, x: item.transform[4] * MM_PER_PT, y: height - item.transform[5] * MM_PER_PT, w: item.width * MM_PER_PT }] : [])));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** The PDF text nearest where the sheet draws `t` (its anchor applied), with how far it is; null when the PDF does not print that text. */
function nearest(t: Placed, page: readonly PdfText[]): { found: PdfText; off: number } | null {
  let best: { found: PdfText; off: number } | null = null;
  for (const p of page.filter((q) => q.text === t.text)) {
    const x = t.anchor === 'middle' ? p.x + p.w / 2 : t.anchor === 'end' ? p.x + p.w : p.x;
    const off = Math.max(Math.abs(x - t.x), Math.abs(p.y - t.y));
    if (!best || off < best.off) best = { found: p, off };
  }
  return best;
}

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] }, groupBy: ['type'], sum: ['area'],
  columns: [{ id: 'type', source: 'attribute' as const, propertyName: 'Type' }, { id: 'area', source: 'quantity' as const, psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
};

const dirs: string[] = [];
afterEach(() => cleanup());
process.on('exit', () => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

describe('ifcsheet build --project prints the sheets the app saved, as the app draws them, on AC20-FZK-Haus (#479)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  after(() => publishDrawingRuntime(null));

  it('the sheets, the moved viewport\'s dimension and text, and the placed schedule\'s rows match the app\'s sheet SVG', async () => {
    resetProject();
    clearDraftHistory();
    useViewDrawings.setState({ byView: {} });
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const { models, geometryResult } = useViewerStore.getState();
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');
    for (const view of useProjectStore.getState().views) {
      if (view.kind === '3d') continue;
      const drawing = await model.planOf(view);
      useViewDrawings.setState((s) => ({ byView: { ...s.byView, [view.id]: { ...EMPTY_VIEW_DRAWING, drawing, status: 'ready' } } }));
    }

    // By hand: the first plan's viewport moved, a dimension and a text drawn on that plan, a list schedule placed.
    const { views, sheets: laid } = useProjectStore.getState();
    const plan = views.find((v) => v.kind === 'plan')!;
    const planSheet = laid.find((s) => s.viewports?.some((vp) => vp.viewId === plan.id))!;
    const vp = planSheet.viewports!.find((v) => v.viewId === plan.id)!;
    assert.ok(vp.center, 'a plan\'s viewport keeps the point it centres');
    updateViewport(planSheet.id, vp.id, { x: vp.x + 15, y: vp.y - 10 });
    const c = vp.center;
    commitDrafts([
      ...useProjectStore.getState().drafts,
      newDraft(plan.id, '0', { type: 'dimension', variant: 'aligned', a: { x: c.x - 4.25, y: c.y }, b: { x: c.x + 4.25, y: c.y }, at: { x: c.x, y: c.y + 1 }, height: 0.25 }),
      newDraft(plan.id, '0', { type: 'text', p: { x: c.x, y: c.y - 2 }, text: 'Hand note', height: 0.25, rotation: 0 }),
    ]);
    const scheduleSheetId = addListScheduleToSet('Walls by type', WALLS_BY_TYPE);

    // What the app's sheets draw, then the project as the app saves it, built by the command line.
    const sheets = useProjectStore.getState().sheets;
    const captured = await captureSheets(sheets);
    assert.deepEqual(captured.failed, []);
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-project-set-'));
    dirs.push(dir);
    const file = join(dir, 'p.ifclite-project.json');
    writeFileSync(file, serializeProject(projectDocument()));
    const built = spawnSync(process.execPath, [BIN, 'build', FZK_HAUS, '--project', file, '--out', join(dir, 'set.pdf')], { encoding: 'utf8', timeout: 110_000 });
    assert.equal(built.status, 0, built.stderr);
    const stderr = built.stderr;
    assert.match(stderr, /printing the drawing set of .*: \d+ sheets?/, stderr);
    const pdf = await pdfPages(new Uint8Array(readFileSync(join(dir, 'set.pdf'))));

    // A page per sheet, in the set's order.
    assert.equal(pdf.length, sheets.length, 'a page per sheet');
    sheets.forEach((s, i) => assert.ok(pdf[i].some((t) => t.text === s.number), `page ${i + 1} prints ${s.number}`));

    const svgOf = (id: string) => new DOMParser().parseFromString(captured.svgs.get(id) ?? '', 'image/svg+xml').documentElement;
    const at = (texts: Placed[], page: PdfText[], what: string) => {
      for (const t of texts) {
        const hit = nearest(t, page);
        assert.ok(hit, `${what}: "${t.text}" is on the sheet but not in the PDF`);
        assert.ok(hit.off < TOLERANCE, `${what}: "${t.text}" is ${hit.off.toFixed(2)} mm from where the sheet draws it (${t.x.toFixed(2)}, ${t.y.toFixed(2)}; PDF ${hit.found.x.toFixed(2)}, ${hit.found.y.toFixed(2)})`);
      }
    };

    // The dimension and the text, where the moved viewport puts them.
    const planPage = pdf[sheets.findIndex((s) => s.id === planSheet.id)];
    const drafted = placedTexts(svgOf(planSheet.id).querySelector(`[data-viewport-id="${vp.id}"]`)!).filter((t) => t.text === '8.50' || t.text === 'Hand note');
    assert.deepEqual(drafted.map((t) => t.text).sort(), ['8.50', 'Hand note'], 'the sheet draws the dimension\'s figure and the text');
    at(drafted, planPage, 'the plan\'s drafts');

    // Every text of the placed schedule: title, header, rows and totals.
    const scheduleSheet = sheets.find((s) => s.id === scheduleSheetId)!;
    const scheduleVp = scheduleSheet.viewports![0];
    const cells = placedTexts(svgOf(scheduleSheet.id).querySelector(`[data-viewport-id="${scheduleVp.id}"]`)!);
    for (const want of ['Walls by type', 'Type', 'Count', 'Total', '13']) assert.ok(cells.some((t) => t.text === want), `the sheet's schedule prints "${want}": ${cells.map((t) => t.text).join('|')}`);
    at(cells, pdf[sheets.indexOf(scheduleSheet)], 'the schedule');
  });
});
