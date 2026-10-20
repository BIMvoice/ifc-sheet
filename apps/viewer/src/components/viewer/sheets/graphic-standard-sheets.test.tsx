/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { setGraphicStandard } from '@/project/graphic-standard-actions';
import { DEFAULT_GRAPHIC_STANDARD, ROMANIAN_PRACTICE } from '@/drafting/graphic-standard';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE, STANDARD } from '@/drafting/styles';
import { currentStyles } from '@/drafting/session';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';
import { sheetDxf } from './sheet-dxf';
import { viewportPens } from './viewport-pens';
import { viewDxf } from '../drafting/view-dxf';
import { planOverlays } from '@/project/plan-overlays';
import type { MeshData } from '@ifc-lite/geometry';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { useSheetContent } from './useSheetContent';

/**
 * The graphic standard reaches every sheet through one path: SheetPaper draws the sheet SVG, and the print (PDF) document and the
 * DXF are made from that SVG. So choosing a standard changes pens and text sizes on every sheet, and the exports cannot disagree.
 */

const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 5, includeHiddenLines: false, creaseAngle: 30, scale: 100 },
  lines: [
    { line: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 },
    { line: { start: { x: 0, y: 1 }, end: { x: 4, y: 1 } }, category: 'projection', visibility: 'visible', entityId: 2, ifcType: 'IfcDoor', modelIndex: 0, depth: 0.5 },
    { line: { start: { x: 0, y: 2 }, end: { x: 4, y: 2 } }, category: 'hidden', visibility: 'hidden', entityId: 3, ifcType: 'IfcBeam', modelIndex: 0, depth: 0.5 },
  ],
  cutPolygons: [{ polygon: { outer: square(0, 0, 4), holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 4 } },
} as unknown as Drawing2D;

let view: ProjectView;
const sheets: ProjectSheet[] = [];

beforeEach(() => {
  resetProject();
  sheets.length = 0;
  const viewId = addProjectView({ kind: 'plan', name: 'Parter', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  view = useProjectStore.getState().views.find((v) => v.id === viewId)!;
  for (const name of ['Planuri', 'Secțiuni']) {
    const id = addProjectSheet(name);
    const viewport: SheetViewport = { id: `vp-${id}`, viewId, x: 200, y: 150, scale: 100, width: 0, height: 0, center: null };
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === id ? { ...x, viewports: [viewport] } : x)) }));
  }
  sheets.push(...useProjectStore.getState().sheets);
});
afterEach(() => cleanup());

/** The sheet drawn as the app draws it: the live SVG element. */
function drawn(sheet: ProjectSheet): SVGSVGElement {
  const container = render(
    <SheetPaper sheet={useProjectStore.getState().sheets.find((s) => s.id === sheet.id)!} projectName="Școala" content={() => ({ view, drawing: DRAWING, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  return container.querySelector('svg')!;
}

const cutWidths = (svg: string) => {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return [...doc.querySelectorAll('path[data-dxf-layer="CUT"]')].map((p) => Number(p.getAttribute('stroke-width')));
};
const sizesOf = (svg: string) => [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text')].map((t) => `${t.textContent}@${t.getAttribute('font-size')}`);

describe('choosing the Romanian-practice standard', () => {
  it('changes the cut pen and the text sizes on every sheet', () => {
    const before = sheets.map((s) => sheetSvgText(drawn(s), s));
    for (const svg of before) {
      assert.deepEqual(cutWidths(svg), [DEFAULT_GRAPHIC_STANDARD.pens.cut]);
      assert.ok(sizesOf(svg).includes(`${sheets[0].number}@${DEFAULT_GRAPHIC_STANDARD.type.number}`) || sizesOf(svg).some((x) => x.endsWith(`@${DEFAULT_GRAPHIC_STANDARD.type.number}`)));
    }
    cleanup();
    setGraphicStandard('ro-practice');
    const after = sheets.map((s) => sheetSvgText(drawn(s), s));
    assert.equal(after.length, 2);
    after.forEach((svg, i) => {
      assert.deepEqual(cutWidths(svg), [ROMANIAN_PRACTICE.pens.cut], `sheet ${i + 1} cut wall pen`);
      const sizes = sizesOf(svg);
      assert.ok(sizes.some((x) => x.endsWith(`@${ROMANIAN_PRACTICE.type.number}`)), `sheet ${i + 1} sheet number size`);
      assert.ok(sizes.includes(`Parter 1:100@${ROMANIAN_PRACTICE.type.viewTitle}`) || sizes.some((x) => x.endsWith(`@${ROMANIAN_PRACTICE.type.viewTitle}`)), `sheet ${i + 1} view title size`);
      assert.notEqual(svg, before[i]);
    });
  });

  it('prints the same pens and sizes in the PDF document as the sheet SVG has', () => {
    setGraphicStandard('ro-practice');
    for (const sheet of sheets) {
      const svg = drawn(sheet);
      const text = sheetSvgText(svg, sheet);
      const html = sheetPrintHtml(svg, sheet);
      const printed = html.slice(html.indexOf('<svg'));
      assert.deepEqual(cutWidths(printed), [ROMANIAN_PRACTICE.pens.cut]);
      assert.deepEqual(sizesOf(printed), sizesOf(text));
      assert.deepEqual([...printed.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1]), [...text.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1]));
    }
  });

  it('writes the DXF lineweights (group 370, hundredths of a millimetre) from the same pens', () => {
    // happy-dom does not resolve SVG presentation attributes into computed style, as a browser does: read them straight.
    const real = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({
      stroke: el.getAttribute('stroke') ?? '', fill: el.getAttribute('fill') ?? '', fontSize: el.getAttribute('font-size') ?? '', textAnchor: el.getAttribute('text-anchor') ?? '',
    })) as unknown as typeof getComputedStyle;
    try {
      const cutLineweight = () => {
        const dxf = new TextDecoder('windows-1252').decode(sheetDxf(drawn(sheets[0]), sheets[0]));
        const line = /LINE\n[\s\S]*?\n\s*8\nCUT\n[\s\S]*?\n370\n(\d+)\n/.exec(dxf) ?? /\n\s*2\nCUT\n[\s\S]*?\n370\n(\d+)\n/.exec(dxf);
        return Number(line?.[1]);
      };
      assert.equal(cutLineweight(), DEFAULT_GRAPHIC_STANDARD.pens.cut * 100);
      cleanup();
      setGraphicStandard('ro-practice');
      assert.equal(cutLineweight(), ROMANIAN_PRACTICE.pens.cut * 100);
      assert.equal(cutLineweight(), 70);
    } finally {
      globalThis.getComputedStyle = real;
    }
  });

  it('prints Romanian text exactly, at the standard\'s height', () => {
    useProjectStore.setState({ titleBlock: { project: 'Școala Țării — ăîâ ș ț', client: 'Ștefan' } });
    const sheet = { ...sheets[0], name: 'Secțiuni ș ț ă' };
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === sheet.id ? sheet : x)) }));
    setGraphicStandard('ro-practice');
    const texts = new Map(sizesOf(sheetSvgText(drawn(sheet), sheet)).map((x) => [x.slice(0, x.lastIndexOf('@')), x.slice(x.lastIndexOf('@') + 1)]));
    for (const value of ['Școala Țării — ăîâ ș ț', 'Ștefan', 'Secțiuni ș ț ă']) {
      assert.equal(texts.get(value), String(ROMANIAN_PRACTICE.type.value), value);
    }
    // Comma-below ș (U+0219) and ț (U+021B) survive as written, not folded to the cedilla forms.
    const svg = sheetSvgText(drawn(sheet), sheet);
    assert.ok(svg.includes('ș') && svg.includes('ț'));
    assert.ok(!svg.includes('ş') && !svg.includes('ţ'));
  });

  it('puts the default back exactly', () => {
    const first = sheets.map((s) => sheetSvgText(drawn(s), s));
    cleanup();
    setGraphicStandard('ro-practice');
    setGraphicStandard('default');
    const text = useProjectStore.getState();
    assert.equal(text.graphicStandard, undefined);
    assert.deepEqual(text.textStyles, [DEFAULT_TEXT_STYLE]);
    const again = sheets.map((s) => sheetSvgText(drawn(s), s));
    assert.deepEqual(again, first);
  });

  it('keeps the user\'s edited Standard styles through default -> preset -> default (PR #121 review)', () => {
    const myText = { ...DEFAULT_TEXT_STYLE, height: 3.5, font: 'serif' as const };
    const myDim = { ...DEFAULT_DIM_STYLE, arrow: 'dot' as const, arrowSize: 3 };
    useProjectStore.setState({ textStyles: [myText], dimStyles: [myDim] });
    setGraphicStandard('ro-practice');
    let s = useProjectStore.getState();
    assert.deepEqual(s.textStyles?.find((t) => t.id === STANDARD), myText, 'the preset does not overwrite Standard');
    assert.deepEqual(s.dimStyles?.find((d) => d.id === STANDARD), myDim);
    setGraphicStandard('default');
    s = useProjectStore.getState();
    assert.deepEqual(s.textStyles, [myText]);
    assert.deepEqual(s.dimStyles, [myDim]);
  });

  it('going back to the default keeps a preset style a draft still uses, so the draft keeps its size and its style id resolves', () => {
    setGraphicStandard('ro-practice');
    const text = { id: 'title', viewId: view.id, layerId: 'default', shape: { type: 'text' as const, p: { x: 0, y: 0 }, text: 'Plan', height: 0.7, rotation: 0 }, params: { textStyle: 'ro-title-70' } };
    const dim = { id: 'dim', viewId: view.id, layerId: 'default', shape: { type: 'dimension' as const, variant: 'aligned' as const, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 0.25 }, params: { dimStyle: 'ro-dim' } };
    useProjectStore.setState({ drafts: [text, dim] });
    setGraphicStandard('default');
    const s = useProjectStore.getState();
    assert.deepEqual(s.textStyles?.map((t) => t.id), [STANDARD, 'ro-text-25', 'ro-title-70'], 'the used title style, and the text style the used dimension style names');
    assert.deepEqual(s.dimStyles?.map((d) => d.id), [STANDARD, 'ro-dim']);
    const title = s.drafts.find((d) => d.id === 'title')?.shape;
    assert.equal(title?.type === 'text' ? title.height : null, 0.7, '7 mm at 1:100 still');
    setGraphicStandard('ro-practice');
    assert.equal(new Set(useProjectStore.getState().textStyles?.map((t) => t.id)).size, useProjectStore.getState().textStyles?.length, 'choosing it again adds no duplicate');
  });

  it('adds the standard\'s styles and selects them for new annotations; the default selects Standard again', () => {
    setGraphicStandard('ro-practice');
    const s = useProjectStore.getState();
    assert.deepEqual(s.textStyles?.map((t) => [t.id, t.height]), [[STANDARD, 2.5], ...ROMANIAN_PRACTICE.textStyles.map((t) => [t.id, t.height])]);
    assert.equal(s.graphicStandard, 'ro-practice');
    assert.deepEqual(currentStyles(), ROMANIAN_PRACTICE.current);
    setGraphicStandard('default');
    assert.deepEqual(currentStyles(), { textStyle: STANDARD, dimStyle: STANDARD });
  });
});

describe('the standard reaches every pen it claims', () => {
  it('a category weight takes the standard\'s cut / projection pair', () => {
    const graphics = { categories: { walls: { lineWeight: 'light' as const }, doors: { lineWeight: 'light' as const } } };
    const widths = (standard: typeof ROMANIAN_PRACTICE) => {
      const pens = viewportPens(DRAWING, graphics, { scale: 10, x: 0, y: 0 }, 'down', [], standard);
      return { cut: pens.find((p) => p.layer === 'CUT')?.width, seen: pens.find((p) => p.layer === 'SEEN')?.width };
    };
    assert.deepEqual(widths(ROMANIAN_PRACTICE), { cut: ROMANIAN_PRACTICE.weights.light.cut, seen: ROMANIAN_PRACTICE.weights.light.projection });
    assert.deepEqual(widths(ROMANIAN_PRACTICE), { cut: 0.35, seen: 0.18 });
    assert.deepEqual(widths(DEFAULT_GRAPHIC_STANDARD), { cut: 0.25, seen: 0.125 });
  });

  it('a drafting view\'s DXF takes the project\'s standard for its pens (group 370)', () => {
    const real = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({
      stroke: el.getAttribute('stroke') ?? '', fill: el.getAttribute('fill') ?? '', fontSize: el.getAttribute('font-size') ?? '', textAnchor: el.getAttribute('text-anchor') ?? '',
    })) as unknown as typeof getComputedStyle;
    try {
      const cutLineweight = () => {
        const dxf = new TextDecoder('windows-1252').decode(viewDxf({ view, drawing: DRAWING, axis: 'down', drafts: [], layers: [], extraPatterns: [], overlays: [] }));
        const line = /LINE\n[\s\S]*?\n\s*8\nCUT\n[\s\S]*?\n370\n(\d+)\n/.exec(dxf) ?? /\n\s*2\nCUT\n[\s\S]*?\n370\n(\d+)\n/.exec(dxf);
        return Number(line?.[1]);
      };
      assert.equal(cutLineweight(), 50);
      setGraphicStandard('ro-practice');
      assert.equal(cutLineweight(), 70);
    } finally {
      globalThis.getComputedStyle = real;
    }
  });

  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [-1.05, 1.05]) for (const z of [-0.03, 0.03]) pts.push(x, y, z);
  const door = { expressId: 7, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 1.05, 2] } as unknown as MeshData;

  it('a sheet\'s door symbols take the project\'s standard', () => {
    publishDrawingRuntime({ geometryResult: { meshes: [door] } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    patchViewDrawing(view.id, { drawing: DRAWING });
    try {
      const widths = () => {
        let out: number[] = [];
        function Probe() {
          const sheet = useProjectStore.getState().sheets[0];
          out = (useSheetContent(sheet).content(sheet.viewports![0]).overlays ?? []).filter((o) => o.layer === 'SYMBOLS').map((o) => o.width).sort();
          return null;
        }
        render(<Probe />);
        cleanup();
        return out;
      };
      assert.deepEqual(widths(), [0.13, 0.5]);
      setGraphicStandard('ro-practice');
      assert.deepEqual(widths(), [0.13, 0.7]);
    } finally {
      publishDrawingRuntime(null);
      useViewDrawings.setState({ byView: {} });
    }
  });

  it('a plan\'s door symbols take the pens they are given', () => {
    const widths = (pens?: typeof ROMANIAN_PRACTICE.pens) => planOverlays(view, { axis: 'y', position: 1.2, flipped: false }, [door], undefined, new Set(), null, pens).map((o) => o.width).sort();
    assert.deepEqual(widths(ROMANIAN_PRACTICE.pens), [0.13, 0.7], 'thin at the hatch pen, the leaf at the cut pen');
    assert.deepEqual(widths(), [0.13, 0.5]);
  });
});
