/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #479: `ifcsheet build --project` prints the drawing set the app saved, as the app's sheets show it. On AC20-FZK-Haus the Wall lays
 * out its set; a plan's viewport is moved by hand, a dimension and a text are drawn on that plan together with one of each other
 * kind the command line prints (a level mark, a leader, a radial and an angular dimension, a grid axis, two hatches, a circle,
 * an arc, a text in a box with a leader, a text in a bubble, a dimension with its figure moved off its line, and four symbols: the north arrow, the scale bar, a coordinate point and one the project holds itself), and a list schedule is placed on a sheet. The project is saved as the app saves it and built with the command line. Then, against the app's sheet SVG (the one
 * the issue captures, `captureSheets`):
 *   - the PDF has a page per sheet, in the set's order, each printing its sheet's number;
 *   - the dimension's figure and the text are printed at the paper point where the sheet draws them (so the moved viewport is where
 *     it was put);
 *   - every text of those drafts is printed where the sheet draws it, and every corner of every line, ring and hatch stroke the
 *     sheet draws for them is a corner of a path in the PDF, within the same tolerance;
 *   - stderr no longer names those kinds as left out;
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
import type { EntityShape } from '@/drafting/types';
import type { DraftSymbol } from '@/catalogue/types';
import { captureSheets } from '@/issue/capture';
import { addBoqArticle, updateBoqArticle } from '@/boq/boq-actions';
import { addListScheduleToSet } from '@/joinery/list-schedule-actions';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { addRegisterToSet, addScheduleToSet, startDrawingSet } from './drawing-set-actions';
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

interface Corner { x: number; y: number }

/** The corners of what `root` draws as lines and fills: each path's points, a circle's four quadrants, a rect's four corners (paper mm). */
function svgCorners(root: Element): Corner[] {
  const out: Corner[] = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.tagName === 'path') {
      const commands = el.getAttribute('d') ?? '';
      // The commands the sheet writes for a path: M and L with absolute points, h for a dot, Z; arcs (`a`) only draw a dot's disc.
      if ([...commands.matchAll(/[A-Za-z]/g)].some((letter) => letter[0] === 'a')) continue;
      for (const [, x, y] of commands.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) out.push({ x: Number(x), y: Number(y) });
    } else if (el.tagName === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => Number(el.getAttribute(a)));
      out.push({ x: cx + r, y: cy }, { x: cx - r, y: cy }, { x: cx, y: cy + r }, { x: cx, y: cy - r });
    } else if (el.tagName === 'ellipse') {
      // A text's bubble frame: the four quadrant points (the engine's outline has them among its vertices).
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((a) => Number(el.getAttribute(a)));
      out.push({ x: cx + rx, y: cy }, { x: cx - rx, y: cy }, { x: cx, y: cy + ry }, { x: cx, y: cy - ry });
    } else if (el.tagName === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));
      out.push({ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h });
    }
  }
  return out;
}

/** Every point of every path the PDF pages draw (paper mm from the top left). */
async function pdfCorners(bytes: Uint8Array): Promise<Corner[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  try {
    const pages: Corner[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const height = page.view[3] * MM_PER_PT;
      const { fnArray, argsArray } = await page.getOperatorList();
      const corners: Corner[] = [];
      fnArray.forEach((fn, j) => {
        if (fn !== pdfjs.OPS.constructPath) return;
        // The path as pdf.js hands it over: [draw op, its numbers...] runs. 0 move and 1 line take a point, 2 a curve three, 3 two, 4 closes.
        const run = Array.from(argsArray[j][1][0] as ArrayLike<number>);
        const takes = [2, 2, 6, 4, 0];
        for (let k = 0; k < run.length; k += 1 + takes[run[k]]) {
          for (let m = 1; m <= takes[run[k]]; m += 2) corners.push({ x: run[k + m] * MM_PER_PT, y: height - run[k + m + 1] * MM_PER_PT });
        }
      });
      pages.push(corners);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] }, groupBy: ['type'], sum: ['area'],
  columns: [{ id: 'type', source: 'attribute' as const, propertyName: 'Type' }, { id: 'area', source: 'quantity' as const, psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
};

/** One of each kind besides the dimension and the text, placed round the viewport's centre `c`, metres. */
const KINDS = (c: { x: number; y: number }): EntityShape[] => {
  const square = (x: number, y: number, side: number) => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];
  return [
    { type: 'level', p: { x: c.x - 3, y: c.y + 2.5 }, value: 2.7, height: 0.25 },
    { type: 'leader', pts: [{ x: c.x + 1, y: c.y + 2.5 }, { x: c.x + 2, y: c.y + 3 }, { x: c.x + 3, y: c.y + 3 }], text: 'Leader note', height: 0.25 },
    { type: 'radial', c: { x: c.x - 2, y: c.y - 1 }, r: 0.8, at: { x: c.x - 1, y: c.y - 0.4 }, diameter: true, height: 0.25 },
    { type: 'angular', c: { x: c.x + 2, y: c.y - 1 }, a: { x: c.x + 3, y: c.y - 1 }, b: { x: c.x + 2, y: c.y }, at: { x: c.x + 2.8, y: c.y - 0.2 }, height: 0.25 },
    { type: 'axis', a: { x: c.x - 3.5, y: c.y - 2.5 }, b: { x: c.x - 3.5, y: c.y - 0.5 }, label: 'A', bubble: 'circle', ends: 'both', size: 0.5, height: 0.25, lineType: 'dashdot' },
    { type: 'hatch', loops: [square(c.x + 3, c.y - 3, 1), square(c.x + 3.3, c.y - 2.7, 0.4)], pattern: 'LINES45', scale: 1, angle: 0 },
    { type: 'hatch', loops: [square(c.x + 1, c.y - 3, 1)], pattern: 'SOLID', scale: 1, angle: 0 },
    { type: 'circle', c: { x: c.x, y: c.y + 0.2 }, r: 0.6 },
    { type: 'arc', c: { x: c.x + 0.5, y: c.y - 1.5 }, r: 0.7, start: 0.3, end: 2.2 },
    // The symbols: paper ones at the viewport's 1:100 (0.1 m a millimetre), the scale bar in metres, and one the project holds itself.
    { type: 'symbol', symbolId: 'builtin:north-arrow', p: { x: c.x - 4, y: c.y + 3.2 }, scale: 0.1, rotation: 0, followsNorth: true },
    { type: 'symbol', symbolId: 'builtin:scale-bar', p: { x: c.x + 0.5, y: c.y + 3.5 }, scale: 1, rotation: 0 },
    { type: 'symbol', symbolId: 'builtin:coordinate-point', p: { x: c.x + 1.5, y: c.y + 1.2 }, scale: 0.1, rotation: 0 },
    { type: 'symbol', symbolId: PROJECT_SYMBOL.id, p: { x: c.x - 1.5, y: c.y + 1.5 }, scale: 0.1, rotation: 0.4 },
    // A text in a box with a leader to a point on the plan, a text in a bubble, and a dimension whose figure was moved off its line (its leader).
    { type: 'text', p: { x: c.x - 3.5, y: c.y + 0.3 }, text: 'Boxed', height: 0.25, rotation: 0, frame: 'box', leader: { x: c.x - 2, y: c.y + 1.1 } },
    { type: 'text', p: { x: c.x + 2.2, y: c.y + 2 }, text: 'Tag', height: 0.25, rotation: 0, frame: 'bubble' },
    { type: 'dimension', variant: 'aligned', a: { x: c.x - 2, y: c.y - 3.4 }, b: { x: c.x + 0.5, y: c.y - 3.4 }, at: { x: c.x - 0.7, y: c.y - 3 }, height: 0.25, textAt: { x: c.x + 1.5, y: c.y - 2.3 } },
  ];
};

/** A symbol only this project holds: a frame, a diagonal and a word, in paper millimetres. */
const PROJECT_SYMBOL: DraftSymbol = {
  id: 'project:bay-mark', name: 'Bay mark', unit: 'paper',
  shapes: [
    { type: 'polyline', pts: [{ x: -6, y: -3 }, { x: 6, y: -3 }, { x: 6, y: 3 }, { x: -6, y: 3 }], closed: true },
    { type: 'line', a: { x: -6, y: -3 }, b: { x: 6, y: 3 } },
    { type: 'text', p: { x: -4, y: 4.5 }, text: 'BAY', height: 2.5, rotation: 0 },
  ],
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
      ...KINDS(c).map((shape) => newDraft(plan.id, '0', shape)),
    ]);
    useProjectStore.setState({ symbols: [PROJECT_SYMBOL] });
    const scheduleSheetId = addListScheduleToSet('Walls by type', WALLS_BY_TYPE);
    // The other kinds the engine prints: the rooms schedule, the bill of quantities and the drawing register, each on a sheet of its own.
    const roomsSheetId = addScheduleToSet('rooms', 'Room schedule');
    updateBoqArticle(addBoqArticle('m2'), { code: 'EXAMPLE-001', description: 'EXAMPLE: wall faces', filter: { classes: ['IfcWallStandardCase'] }, quantity: 'NetSideArea' });
    const boqSheetId = addScheduleToSet('boq', 'Bill of quantities');
    const registerSheetId = addRegisterToSet('Drawing register');

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

    // The other kinds: each one's texts, and every corner of what the sheet strokes or fills for it, are in the PDF. The sheet draws the
    // drafts in order, each in a group of its own (a line or arc as a bare path), after the drawing: they are its last children.
    const room = svgOf(planSheet.id).querySelector(`[data-viewport-id="${vp.id}"] > g`)!;
    const kinds = KINDS(c);
    const clipRect = svgOf(planSheet.id).querySelector(`[data-viewport-id="${vp.id}"] clipPath rect`)!;
    const [cx, cy, cw, ch] = ['x', 'y', 'width', 'height'].map((a) => Number(clipRect.getAttribute(a)));
    const clip = { x: cx, y: cy, w: cw, h: ch };
    const ours = [...room.children].slice(-(kinds.length + 2));
    assert.equal(ours.length, kinds.length + 2, 'the sheet draws the dimension, the text and one of each other kind');
    const paths = (await pdfCorners(new Uint8Array(readFileSync(join(dir, 'set.pdf')))))[sheets.findIndex((s) => s.id === planSheet.id)];
    let clippedAway = 0;
    kinds.forEach((kind, i) => {
      const drawn = ours[i + 2];
      const corners = svgCorners(drawn);
      assert.ok(corners.length > 0, `the sheet strokes something for the ${kind.type}`);
      // The sheet clips the viewport to its room, so a stroke past it (the scale bar is 100 mm of paper, wider than this room) has no
      // corner there in the PDF, which clips its lines to the room as well.
      const inside = corners.filter((q) => q.x > clip.x + 0.5 && q.x < clip.x + clip.w - 0.5 && q.y > clip.y + 0.5 && q.y < clip.y + clip.h - 0.5);
      assert.ok(inside.length > 0, `part of the ${kind.type} is in the viewport's room`);
      for (const corner of inside) {
        const off = Math.min(...paths.map((p) => Math.max(Math.abs(p.x - corner.x), Math.abs(p.y - corner.y))));
        assert.ok(off < TOLERANCE, `the ${kind.type}: a corner at (${corner.x.toFixed(2)}, ${corner.y.toFixed(2)}) is ${off.toFixed(2)} mm from the nearest path point of the PDF`);
      }
      // The sheet's clipPath hides a text past the viewport's room (the scale bar's tick figures): the PDF prints the texts inside it,
      // at the sheet's place, and none outside it.
      const texts = placedTexts(drawn);
      const inRoom = (t: Placed, m: number) => t.x > clip.x + m && t.x < clip.x + clip.w - m && t.y > clip.y + m && t.y < clip.y + clip.h - m;
      const outRoom = (t: Placed) => t.x < clip.x - 0.5 || t.x > clip.x + clip.w + 0.5 || t.y < clip.y - 0.5 || t.y > clip.y + clip.h + 0.5;
      at(texts.filter((t) => inRoom(t, 0.5)), planPage, `the ${kind.type}`);
      for (const t of texts.filter(outRoom)) {
        clippedAway += 1;
        const hit = nearest(t, planPage);
        assert.ok(!hit || hit.off >= TOLERANCE, `the ${kind.type}: "${t.text}" is outside the viewport's room (${t.x.toFixed(2)}, ${t.y.toFixed(2)}) but the PDF prints it`);
      }
    });
    assert.ok(clippedAway > 0, 'the scale bar\'s tick figures past the room are among the texts the sheet clips away');
    assert.ok(ours.slice(2).some((g) => placedTexts(g).some((t) => t.text === '+2.70')), 'the sheet writes the level mark\'s figure');
    // The symbols' texts (the north arrow's N, the scale bar's ticks, the coordinates, the project symbol's word) were each checked against the PDF with the rest.
    const symbolTexts = ours.slice(2).flatMap((g, i) => (kinds[i].type === 'symbol' ? placedTexts(g).map((t) => t.text) : []));
    assert.deepEqual(['N', 'BAY'].filter((want) => !symbolTexts.some((t) => t === want)), [], `the sheet writes the arrow's N and the project symbol's word: ${symbolTexts.join('|')}`);
    const coordinatePoint = ours[2 + kinds.findIndex((k) => k.type === 'symbol' && k.symbolId === 'builtin:coordinate-point')];
    assert.equal(placedTexts(coordinatePoint).length, 2, 'the sheet writes two lines of coordinates (each is checked against the PDF above)');
    for (const word of ['symbols', 'level marks', 'leaders', 'radial', 'angular', 'grid axes', 'hatches', 'circles', 'arcs', 'frame or leader', 'moved figure', 'coordinate point']) assert.ok(!stderr.includes(word), `stderr no longer names ${word} as left out: ${stderr}`);

    // Every text of the placed schedule: title, header, rows and totals.
    const scheduleSheet = sheets.find((s) => s.id === scheduleSheetId)!;
    const scheduleVp = scheduleSheet.viewports![0];
    const cells = placedTexts(svgOf(scheduleSheet.id).querySelector(`[data-viewport-id="${scheduleVp.id}"]`)!);
    for (const want of ['Walls by type', 'Type', 'Count', 'Total', '13']) assert.ok(cells.some((t) => t.text === want), `the sheet's schedule prints "${want}": ${cells.map((t) => t.text).join('|')}`);
    at(cells, pdf[sheets.indexOf(scheduleSheet)], 'the schedule');

    // The rooms schedule, the bill of quantities and the register: every text of the table the sheet draws is printed where it draws it,
    // and the build no longer says it leaves them out.
    const tableOf = (id: string, what: string, wanted: readonly string[]) => {
      const sheet = sheets.find((s) => s.id === id)!;
      const texts = placedTexts(svgOf(sheet.id).querySelector(`[data-viewport-id="${sheet.viewports![0].id}"]`)!);
      for (const want of wanted) assert.ok(texts.some((t) => t.text === want), `the sheet's ${what} prints "${want}": ${texts.map((t) => t.text).join('|')}`);
      at(texts, pdf[sheets.indexOf(sheet)], what);
    };
    tableOf(roomsSheetId, 'rooms schedule', ['Room schedule', 'Total building (Au)']);
    tableOf(boqSheetId, 'bill of quantities', ['Bill of quantities', 'EXAMPLE-001']);
    tableOf(registerSheetId, 'drawing register', ['Drawing register', 'Sheet', 'Title', 'Scale', 'Revision', 'Date', scheduleSheet.number]);
    assert.doesNotMatch(stderr, /(rooms|boq|register) schedule/, 'the build prints these kinds and does not name them as left out');
  });
});
