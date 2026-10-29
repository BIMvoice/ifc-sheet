/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { MARK_STYLES, markStyleOf, graphicStandardOf, type MarkStyle } from '@bimvoice/ifcsheet';
import { DEFAULT_GRAPHIC_STANDARD, GRAPHIC_STANDARDS, type GraphicStandard } from '@/drafting/graphic-standard';
import { lookOf } from '@/drafting/styles';
import { cleanup, render } from '@/test/render.js';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { setGraphicStandard } from '@/project/graphic-standard-actions';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { installSectionLink } from '@/drafting/section-link';
import { createSectionOnPlan } from '@/drafting/section-create';
import { symbolParts } from '@/drafting/section-link';
import { sectionSymbolShapes } from '@/drafting/section-symbol';
import { clearDraftHistory } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';
import { sheetDxf } from './sheet-dxf';
import { useSheetContent } from './useSheetContent';

/**
 * #447: the heads of section and elevation marks are the project's choice (its graphic standard). Switching it redraws every
 * mark of the drawing set in the new style, on screen, on the sheet, in the print (PDF) and in the DXF; the sheet, the print
 * and the DXF are made from one SVG, the screen draws the same stored symbols with the same component.
 */

const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 5, includeHiddenLines: false, creaseAngle: 30, scale: 100 },
  lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 12, y: 0 } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 }],
  cutPolygons: [{ polygon: { outer: square(0, 0, 12), holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 12, y: 12 } },
} as unknown as Drawing2D;

const PLAN_PLANE = { axis: 'y', position: 1.2, flipped: false } as unknown as SectionPlaneConfig;
const SECTIONS = 2;
const ELEVATIONS = 2;
const ENDS = 2;

let sheetId = '';
let uninstall = () => {};

/** A ground plan with two sections drawn on it and two elevations, all on one sheet, so every mark prints its reference. */
beforeEach(() => {
  resetProject();
  clearDraftHistory();
  uninstall = installSectionLink();
  const plan = addProjectView({ kind: 'plan', name: 'Parter', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  patchViewDrawing(plan, { drawing: DRAWING });
  const ids = [plan];
  for (const y of [3, 8]) {
    const id = createSectionOnPlan({ planViewId: plan, plan: PLAN_PLANE, a: { x: 1, y }, b: { x: 11, y }, side: { x: 6, y: y + 1 }, layerId: 'default', textHeight: 0.25 });
    assert.ok(id, 'a section is made');
    ids.push(id);
  }
  for (const direction of ['north', 'south'] as const) ids.push(addProjectView({ kind: 'elevation', name: direction, direction } as never));
  sheetId = addProjectSheet('Planuri');
  const viewports = ids.map((viewId, i) => ({ id: `vp-${i}`, viewId, x: 60 + 90 * i, y: 150, scale: 100, width: 0, height: 0, center: null }));
  useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === sheetId ? { ...x, viewports } : x)) }));
});
afterEach(() => {
  cleanup();
  uninstall();
  useViewDrawings.setState({ byView: {} });
});

function Paper({ onSvg }: { onSvg: (svg: SVGSVGElement) => void }) {
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  const { content } = useSheetContent(sheet);
  return <SheetPaper ref={(el) => { if (el) onSvg(el); }} sheet={sheet} projectName="Școala" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />;
}

/** The sheet as the app draws it. */
function drawn(): SVGSVGElement {
  let svg: SVGSVGElement | null = null;
  render(<Paper onSvg={(el) => { svg = el; }} />);
  assert.ok(svg, 'the sheet is drawn');
  return svg;
}

/** The closed paths of an SVG, by their number of corners. A circle is a polygon of many. */
function closedBy(svgText: string): { triangles: number; flags: number; circles: number; solid: number } {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const closed = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '').filter((d) => /Z$/.test(d) && d.split('M').length === 2).map((d) => d.split('L').length);
  return {
    triangles: closed.filter((n) => n === 3).length, flags: closed.filter((n) => n === 5).length, circles: closed.filter((n) => n >= 12).length,
    solid: doc.querySelectorAll('path[data-dxf-fill="solid"]').length,
  };
}

/** The same count from a DXF: closed polylines by their number of vertices, and solid hatches. */
function dxfCounts(bytes: Uint8Array): { triangles: number; flags: number; circles: number; solid: number } {
  const lines = new TextDecoder('windows-1252').decode(bytes).split(/\r?\n/).map((l) => l.trim());
  let triangles = 0, flags = 0, circles = 0, solid = 0;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] !== '0') continue;
    if (lines[i + 1] === 'HATCH') solid++;
    if (lines[i + 1] !== 'LWPOLYLINE') continue;
    let n = 0, closed = false;
    for (let j = i + 2; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
      if (lines[j] === '90') n = Number(lines[j + 1]);
      if (lines[j] === '70') closed = lines[j + 1] === '1';
    }
    if (!closed) continue;
    if (n === 3) triangles++;
    else if (n === 5) flags++;
    else if (n >= 12) circles++;
  }
  return { triangles, flags, circles, solid };
}

const subtract = (a: ReturnType<typeof closedBy>, b: ReturnType<typeof closedBy>) => ({ triangles: a.triangles - b.triangles, flags: a.flags - b.flags, circles: a.circles - b.circles, solid: a.solid - b.solid });

/** What a style adds to the arrow, in the shapes it is made of: one head per section end and one per elevation. */
const HEADS = SECTIONS * ENDS + ELEVATIONS;
const ADDS: Record<MarkStyle, { triangles: number; flags: number; circles: number; solid: number }> = {
  arrow: { triangles: 0, flags: 0, circles: 0, solid: 0 },
  circle: { triangles: HEADS, flags: 0, circles: HEADS, solid: HEADS },
  flag: { triangles: 0, flags: HEADS, circles: 0, solid: 0 },
};

/** happy-dom does not resolve SVG presentation attributes into computed style, as a browser does: read them straight. */
function withAttributeStyle<T>(run: () => T): T {
  const real = globalThis.getComputedStyle;
  globalThis.getComputedStyle = ((el: Element) => ({
    stroke: el.getAttribute('stroke') ?? '', fill: el.getAttribute('fill') ?? '', fontSize: el.getAttribute('font-size') ?? '', textAnchor: el.getAttribute('text-anchor') ?? '',
  })) as unknown as typeof getComputedStyle;
  try { return run(); } finally { globalThis.getComputedStyle = real; }
}

/** A standard that heads its marks `style`: the built-in ones carry the arrow (default) and the circle (Romanian practice); the flag is reachable by any standard that names it. */
const TEST_FLAG = { ...DEFAULT_GRAPHIC_STANDARD, id: 'test-flag', name: 'Flag marks', markStyle: 'flag' as const };
const STANDARD_OF: Record<MarkStyle, string> = { arrow: 'default', circle: 'ro-practice', flag: TEST_FLAG.id };
beforeEach(() => { (GRAPHIC_STANDARDS as GraphicStandard[]).push(TEST_FLAG); });
afterEach(() => { (GRAPHIC_STANDARDS as GraphicStandard[]).splice((GRAPHIC_STANDARDS as GraphicStandard[]).indexOf(TEST_FLAG), 1); });

/** Draw the sheet under `style`, and read the shapes of its sheet SVG, its print and its DXF. */
function outputsUnder(style: MarkStyle) {
  cleanup();
  setGraphicStandard(STANDARD_OF[style]);
  const sheet = useProjectStore.getState().sheets.find((x) => x.id === sheetId)!;
  const svgEl = drawn();
  const svg = sheetSvgText(svgEl, sheet);
  const html = sheetPrintHtml(svgEl, sheet);
  return { svg: closedBy(svg), print: closedBy(html.slice(html.indexOf('<svg'))), dxf: withAttributeStyle(() => dxfCounts(sheetDxf(svgEl, sheet))) };
}

describe('the mark style of the graphic standard (#447)', () => {
  it('reads the arrow from the default and the circle from the Romanian practice standard', () => {
    assert.equal(markStyleOf(graphicStandardOf('default')), 'arrow');
    assert.equal(markStyleOf(graphicStandardOf('ro-practice')), 'circle');
    assert.deepEqual([...MARK_STYLES], ['arrow', 'circle', 'flag']);
  });

  it('switching the style redraws every section and elevation mark, in the sheet, the print and the DXF', () => {
    const arrow = outputsUnder('arrow');
    for (const style of ['circle', 'flag', 'arrow'] as const) {
      const now = outputsUnder(style);
      for (const out of ['svg', 'print', 'dxf'] as const) {
        assert.deepEqual(subtract(now[out], arrow[out]), ADDS[style], `${style}: ${out}`);
      }
    }
  });

  it('draws the same symbols on screen as on the sheet: the stored section drafts, through the same component', () => {
    for (const style of ['circle', 'flag', 'arrow'] as const) {
      setGraphicStandard(STANDARD_OF[style]);
      const parts = useProjectStore.getState().views.filter((v) => v.kind === 'section').flatMap((v) => symbolParts(useProjectStore.getState().drafts, v.id));
      const s0 = useProjectStore.getState();
      const container = render(
        <svg>{parts.map((e) => (e.shape.type === 'hatch'
          ? <AnnotationGraphics key={e.id} shape={e.shape} color="#000" selected={false} transform={{ scale: 100, x: 0, y: 0 }} axis="down" extraPatterns={[]} strokeScale={1} look={lookOf({ textStyles: s0.textStyles ?? [], dimStyles: s0.dimStyles ?? [] }, e.params)} paperUnit={1} />
          : null))}</svg>,
      );
      assert.equal(container.querySelectorAll('path[data-dxf-fill="solid"]').length, style === 'circle' ? SECTIONS * ENDS : 0, style);
      const kinds = parts.map((e) => e.shape.type);
      assert.equal(kinds.filter((k) => k === 'circle').length, style === 'circle' ? SECTIONS * ENDS : 0, `${style}: circles stored`);
      assert.equal(kinds.filter((k) => k === 'polyline').length, style === 'flag' ? SECTIONS * ENDS : 0, `${style}: flags stored`);
      cleanup();
    }
  });

  it('keeps the symbol attached to its section through a restyle: the cut line and first pole stay the first two lines, the letter is kept', () => {
    const before = useProjectStore.getState().views.filter((v) => v.kind === 'section').map((v) => symbolParts(useProjectStore.getState().drafts, v.id));
    setGraphicStandard('ro-practice');
    const after = useProjectStore.getState().views.filter((v) => v.kind === 'section').map((v) => symbolParts(useProjectStore.getState().drafts, v.id));
    after.forEach((parts, i) => {
      const lines = (list: DraftEntity[]) => list.flatMap((p) => (p.shape.type === 'line' ? [p.shape] : []));
      assert.deepEqual(lines(parts).slice(0, 1), lines(before[i]).slice(0, 1), 'the cut line is where it was');
      assert.equal(parts.filter((p) => p.shape.type === 'text').length, 2, 'two letters');
      assert.deepEqual(parts.map((p) => p.shape.type).filter((t) => t === 'circle' || t === 'hatch').length, 4, 'a circle and a triangle at each end');
      assert.equal(before[i].some((p) => p.shape.type === 'circle'), false, 'the arrow had none');
    });
  });

  it('lays out each head from its own shapes: the pole ends at the head, the letter is inside it', () => {
    for (const style of ['circle', 'flag'] as const) {
      const shapes = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 1 }, 'A', 0.25, style);
      const letter = shapes.find((s) => s.type === 'text');
      const head = shapes.find((s) => s.type === (style === 'circle' ? 'circle' : 'polyline'));
      assert.ok(letter && letter.type === 'text' && head, style);
      if (head.type === 'circle') assert.ok(Math.hypot(letter.p.x - head.c.x, letter.p.y - head.c.y) < head.r, 'the letter is inside the circle');
    }
  });
});
