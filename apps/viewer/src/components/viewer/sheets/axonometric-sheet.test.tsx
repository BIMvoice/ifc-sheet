/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFloorPlan } from '@ifc-lite/drawing-2d';
import { GeometryProcessor, type MeshData } from '@ifc-lite/geometry';
import { cleanup, render } from '@/test/render.js';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { drawAxonometric } from '@/project/axonometric';
import { drawingAsViewShows } from '@/project/view-appearance';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { captureViewRaster } from '@/lib/export/view-raster-capture';
import { rasterRequest } from '@/project/view-raster';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';
import { useSheetContent } from './useSheetContent';

/**
 * Issue #49: an axonometric of the demo project sits on a sheet beside a plan
 * and prints as vector paths at its scale; a perspective prints as one image
 * sized for its box at 300 dpi.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const DEMO = join(ROOT, 'apps', 'viewer', 'public', 'samples', 'bloc-p4.ifc');
const WASM = join(ROOT, 'packages', 'wasm', 'pkg', 'ifc-lite_bg.wasm');

const LEVEL: ProjectLevel = { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] };

beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  useViewDrawings.setState({ byView: {} });
});

/** A sheet the way the Wall draws it: through the content hook, then exported as the user would. */
function SheetFor({ sheet, onSvg }: { sheet: ProjectSheet; onSvg: (svg: SVGSVGElement | null) => void }) {
  const { content } = useSheetContent(sheet);
  return <SheetPaper ref={onSvg} sheet={sheet} projectName="Bloc P+4" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />;
}

function exportSheet(sheetId: string): { svg: string; sheet: ProjectSheet; el: SVGSVGElement } {
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  let el: SVGSVGElement | null = null;
  render(<SheetFor sheet={sheet} onSvg={(s) => { el = s; }} />);
  assert.ok(el, 'the sheet renders');
  return { svg: sheetSvgText(el, sheet), sheet, el };
}

async function meshesOf(path: string): Promise<MeshData[]> {
  const bytes = readFileSync(path);
  // The wasm is initialised from bytes: happy-dom's `fetch` cannot read a file URL.
  const { default: init } = await import('@ifc-lite/wasm');
  await init({ module_or_path: readFileSync(WASM) });
  const processor = new GeometryProcessor();
  try {
    await processor.init();
    return (await processor.process(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))).meshes;
  } finally {
    processor.dispose();
  }
}

/** The `<g data-viewport-id>` of one viewport, as markup. */
function viewportMarkup(svg: string, viewportId: string): string {
  const start = svg.indexOf(`data-viewport-id="${viewportId}"`);
  assert.ok(start >= 0, 'the viewport is on the sheet');
  const next = svg.indexOf('data-viewport-id=', start + 10);
  return svg.slice(start, next < 0 ? undefined : next);
}

describe('an axonometric of the demo project on a sheet (issue #49)', () => {
  it('sits beside the plan as vector paths at its scale, and the PDF prints the same SVG', async (t) => {
    if (!existsSync(WASM)) return t.skip('run pnpm build:wasm:fetch for the real demo model');
    const meshes = await meshesOf(DEMO);
    assert.ok(meshes.length > 100, `the demo tessellates (${meshes.length} meshes)`);

    const planId = addProjectView({ kind: 'plan', name: 'Ground Floor', level: LEVEL, cutHeight: 1.2, scale: 100 });
    const axoId = addProjectView({ kind: '3d', name: 'Axonometric', viewpoint: null, projection: 'axonometric', preset: 'se', scale: 200 });
    const axo = useProjectStore.getState().views.find((v) => v.id === axoId)!;
    assert.equal(axo.kind, '3d');
    if (axo.kind !== '3d') return;

    const plan = await generateFloorPlan(meshes, 1.2, { useGPU: false, includeProjection: false, includeEdges: false });
    patchViewDrawing(planId, { drawing: drawingAsViewShows(plan, { kind: 'plan' }), status: 'ready' });
    const drawn = await drawAxonometric(meshes, axo);
    patchViewDrawing(axoId, { drawing: drawn, status: 'ready' });
    assert.ok(drawn.lines.length > 100, `the axonometric has line work (${drawn.lines.length} lines)`);

    const sheetId = addProjectSheet('Presentation');
    const planVp = addViewport(sheetId, planId, { x: 220, y: 250 }, 100);
    const axoVp = addViewport(sheetId, axoId, { x: 600, y: 250 }, 200);
    const { svg, sheet } = exportSheet(sheetId);

    // Beside the plans, as vector paths and no image.
    const axoMarkup = viewportMarkup(svg, axoVp);
    assert.ok((axoMarkup.match(/<path /g) ?? []).length > 0, 'the axonometric prints as paths');
    assert.doesNotMatch(axoMarkup, /<image/);
    assert.doesNotMatch(svg, /<image/, 'no image anywhere on the sheet');
    assert.ok(viewportMarkup(svg, planVp).includes('<path '), 'the plan is on the sheet too');
    assert.match(svg.slice(0, 600), /width="841mm"/, 'in real millimetres');
    assert.match(svg.slice(0, 600), /height="594mm"/);

    // At its scale: the paths' extent is the drawing's extent at 1:200, to the pen's rounding.
    const nums = [...axoMarkup.matchAll(/ d="([^"]+)"/g)].flatMap((m) => [...m[1].matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((p) => ({ x: Number(p[1]), y: Number(p[2]) })));
    const outline = drawn.lines.filter((l) => l.category !== 'cut');
    assert.ok(outline.length > 0);
    const w = (drawn.bounds.max.x - drawn.bounds.min.x) * 5; // 1000 / 200 mm per metre
    const h = (drawn.bounds.max.y - drawn.bounds.min.y) * 5;
    const xs = nums.map((p) => p.x);
    const ys = nums.map((p) => p.y);
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - w) < 0.1, `width ${Math.max(...xs) - Math.min(...xs)} vs ${w} mm`);
    assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - h) < 0.1, `height ${Math.max(...ys) - Math.min(...ys)} vs ${h} mm`);
    assert.match(svg, /1:200/, 'the viewport label says its scale');

    // The PDF is the print of this same SVG, in the sheet's paper size.
    const html = sheetPrintHtml(useSheetElement(), sheet);
    assert.ok(html.includes(axoMarkup.slice(0, 400)), 'the print document carries the same paths');
    assert.match(html, /@page\{size:841mm 594mm;margin:0\}/);
  });
});

/** The rendered sheet's svg element (the last one mounted). */
function useSheetElement(): SVGSVGElement {
  const svgs = document.querySelectorAll('svg[data-sheet-id]');
  return svgs[svgs.length - 1] as SVGSVGElement;
}

describe('the frame of an axonometric on the sheet (issue #49)', () => {
  /** A unit cube at (10, 2, -5): the analytic SE isometric is X = (x - z) / sqrt 2, Y = (-x + 2y - z) / sqrt 6 about the cube's centre. */
  function cubeMesh(): MeshData {
    const [x0, y0, z0, x1, y1, z1] = [10, 2, -5, 11, 3, -4];
    const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
    const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
    return { expressId: 1, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] } as MeshData;
  }

  it('prints the cube at the analytic isometric corners, in millimetres at 1:100, with up still up', async () => {
    const axoId = addProjectView({ kind: '3d', name: 'Axonometric', viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100 });
    const axo = useProjectStore.getState().views[0];
    assert.equal(axo.kind, '3d');
    if (axo.kind !== '3d') return;
    patchViewDrawing(axoId, { drawing: await drawAxonometric([cubeMesh()], axo), status: 'ready' });
    const sheetId = addProjectSheet('Cube');
    const vpId = addViewport(sheetId, axoId, { x: 300, y: 200 }, 100);
    const { svg } = exportSheet(sheetId);
    const points = [...viewportMarkup(svg, vpId).matchAll(/ d="([^"]+)"/g)].flatMap((m) => [...m[1].matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((p) => ({ x: Number(p[1]), y: Number(p[2]) })));
    assert.ok(points.length > 0);
    const R2 = Math.SQRT2;
    const R6 = Math.sqrt(6);
    const at = (x: number, y: number, z: number) => ({ x: 300 + (((x - 10.5) - (z + 4.5)) / R2) * 10, y: 200 - ((-(x - 10.5) + 2 * (y - 2.5) - (z + 4.5)) / R6) * 10 });
    for (const [x, y, z] of [[11, 3, -4], [10, 3, -4], [11, 3, -5], [10, 3, -5], [11, 2, -4], [10, 2, -4], [11, 2, -5]]) {
      const want = at(x, y, z);
      assert.ok(points.some((p) => Math.hypot(p.x - want.x, p.y - want.y) < 0.1), `corner (${x}, ${y}, ${z}) is printed at (${want.x.toFixed(2)}, ${want.y.toFixed(2)}) mm`);
    }
    assert.ok(at(10, 3, -4).y < at(10, 2, -4).y, 'analytic: the top of an edge is above its bottom on the paper');
  });
});

describe('a perspective on a sheet (issue #49)', () => {
  it('asks for a 150 x 100 mm viewport at 300 dpi, and the sheet embeds one image of that box', async () => {
    const viewId = addProjectView({ kind: '3d', name: 'Perspective', viewpoint: null, projection: 'perspective' });
    const sheetId = addProjectSheet('Views');
    const vpId = addViewport(sheetId, viewId, { x: 200, y: 150 });
    const vp = useProjectStore.getState().sheets[0].viewports![0];
    assert.equal(vp.id, vpId);
    assert.deepEqual([vp.width, vp.height], [150, 100], 'placed at 150 x 100 mm');

    const asked: [number, number][] = [];
    const view = useProjectStore.getState().views[0];
    assert.equal(view.kind, '3d');
    if (view.kind !== '3d') return;
    const raster = await captureViewRaster(view, { width: vp.width, height: vp.height }, {
      modelBounds: () => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 8 } }),
      capture: async (_vp, w, h) => {
        asked.push([w, h]);
        return 'data:image/png;base64,iVBORw0KGgo=';
      },
    });
    // ceil(150 mm * 300 / 25.4) = 1772, ceil(100 mm * 300 / 25.4) = 1182
    assert.deepEqual(asked, [[1772, 1182]]);
    assert.deepEqual([rasterRequest(150, 100).widthPx, rasterRequest(150, 100).heightPx], [1772, 1182]);
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === viewId ? { ...v, raster } : v)) });

    const { svg } = exportSheet(sheetId);
    const images = svg.match(/<image [^>]*>/g) ?? [];
    assert.equal(images.length, 1, 'one image on the sheet');
    assert.match(images[0], /width="150"/);
    assert.match(images[0], /height="100"/);
    assert.match(images[0], /data-raster-px="1772x1182"/);
    assert.match(images[0], /href="data:image\/png;base64,/);
    assert.match(svg, /Perspective  \(no scale\)/, 'a perspective states no scale');
    assert.doesNotMatch(svg, /1:100/, 'and the title block states none either');
  });
});
