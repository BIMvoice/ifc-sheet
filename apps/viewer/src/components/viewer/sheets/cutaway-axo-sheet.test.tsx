/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { generateViewDrawings } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { meshFile } from '@/test/view-drawing-harness';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { drawAxonometric, generateAxonometricDrawing } from '@/project/axonometric';
import { defaultPlanCutHeight } from '@/project/view-defaults';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import { __setGenerationWorkerFactoryForTest, generateDrawing, type GenerationWorker } from '@/lib/drawing/generation/client';
import { handle } from '@/lib/drawing/generation/drawing-generation.worker';
import { axonometricJob } from '@/lib/drawing/generation/generate-job';
import type { ProjectLevel, ProjectSheet, ThreeDProjectView } from '@/project/types';
import { cutawayAxoView } from '../wall/CutawayAxoForm';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';
import { useSheetContent } from './useSheetContent';

/**
 * Issue #97: a storey cut-away axonometric of AC20-FZK-Haus (the committed
 * fixture) sits on a sheet and prints as vector paths, its cut walls filled;
 * the engine's headless set and the generation worker draw the same view the
 * app draws.
 */

const FZK = new URL('../../../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const LEVELS: ProjectLevel[] = [
  { name: 'Dachgeschoss', elevation: 2.7, storeyGlobalIds: ['273g3wqLzDtfYIl7qqkgcO'] },
  { name: 'Erdgeschoss', elevation: 0, storeyGlobalIds: ['2eyxpyOx95m90jmsXLOuR0'] },
];
const GROUND = LEVELS[1];

let meshes: MeshData[] | null = null;
before(async () => { meshes = (await meshFile(FZK))?.meshes ?? null; });
beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  useViewDrawings.setState({ byView: {} });
});
after(() => __setGenerationWorkerFactoryForTest(null));

function SheetFor({ sheet, onSvg }: { sheet: ProjectSheet; onSvg: (svg: SVGSVGElement | null) => void }) {
  const { content } = useSheetContent(sheet);
  return <SheetPaper ref={onSvg} sheet={sheet} projectName="FZK-Haus" content={content} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />;
}

function exportSheet(sheetId: string): { svg: string; sheet: ProjectSheet; el: SVGSVGElement } {
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  let el: SVGSVGElement | null = null;
  render(<SheetFor sheet={sheet} onSvg={(s) => { el = s; }} />);
  assert.ok(el, 'the sheet renders');
  return { svg: sheetSvgText(el, sheet), sheet, el };
}

function viewportMarkup(svg: string, viewportId: string): string {
  const start = svg.indexOf(`data-viewport-id="${viewportId}"`);
  assert.ok(start >= 0, 'the viewport is on the sheet');
  const next = svg.indexOf('data-viewport-id=', start + 10);
  return svg.slice(start, next < 0 ? undefined : next);
}

/** The ground-floor cut-away as "Add a drawing" makes it: cut at the storey's default plan height, from the south-east. */
function addCutaway(): ThreeDProjectView {
  useProjectStore.setState({ levels: LEVELS });
  const id = addProjectView(cutawayAxoView('Erdgeschoss, cut-away axonometric', GROUND, defaultPlanCutHeight(GROUND, LEVELS), 'se'));
  const view = useProjectStore.getState().views.find((v) => v.id === id)!;
  assert.equal(view.kind, '3d');
  return view as ThreeDProjectView;
}

/** The drawing without the one field that is a measurement, not a result. */
const timeless = (d: Drawing2D) => ({ ...d, stats: { ...d.stats, processingTimeMs: 0 } });

describe('a cut-away axonometric of the FZK-Haus ground floor on a sheet (issue #97)', () => {
  it('prints as vector paths, its cut faces filled, and the PDF prints the same SVG', async (t) => {
    if (!meshes) return t.skip('run pnpm build:wasm:fetch for the real model');
    const axo = addCutaway();
    assert.equal(axo.cutaway?.storey?.cutHeight, 1.2, 'the default plan cut');
    const drawn = await drawAxonometric(meshes, axo, LEVELS);
    assert.ok(drawn.cutPolygons.length > 20, `cut faces (${drawn.cutPolygons.length})`);
    assert.ok(drawn.lines.every((l) => l.visibility !== 'hidden'), 'hidden lines left out, as a 3D view shows them');
    patchViewDrawing(axo.id, { drawing: drawn, status: 'ready' });

    const sheetId = addProjectSheet('Presentation');
    const vp = addViewport(sheetId, axo.id, { x: 300, y: 200 }, 100);
    const { svg, sheet } = exportSheet(sheetId);
    const markup = viewportMarkup(svg, vp);
    const path = (layer: string) => new RegExp(`<path data-dxf-layer="${layer}"[^>]* d="([^"]+)"([^>]*)>`).exec(markup);
    const fill = path('FILL');
    assert.ok(fill, 'the cut faces are a filled path');
    assert.match(fill[2], /fill="#[0-9a-f]{6}"/, 'filled, not outlined');
    const rings = drawn.cutPolygons.reduce((n, p) => n + 1 + p.polygon.holes.length, 0);
    assert.equal((fill[1].match(/M/g) ?? []).length, rings, 'every cut face and hole is in it');
    assert.ok((path('CUT')?.[1].match(/M/g) ?? []).length > 100, 'the cut outline in the heavy pen');
    assert.ok((path('SEEN')?.[1].match(/M/g) ?? []).length > 100, 'the line work seen beyond, in the light pen');
    assert.doesNotMatch(svg, /<image/, 'no image anywhere on the sheet');
    assert.match(svg, /1:100/, 'the viewport label says its scale');

    const html = sheetPrintHtml(document.querySelector('svg[data-sheet-id]') as SVGSVGElement, sheet);
    assert.ok(html.includes(markup.slice(0, 400)), 'the print document carries the same paths');
    assert.doesNotMatch(html, /<image/);
  });

  it('the engine draws what the app draws', async (t) => {
    if (!meshes) return t.skip('run pnpm build:wasm:fetch for the real model');
    const axo = addCutaway();
    const app = await drawAxonometric(meshes, axo, LEVELS);
    const extent = { min: { x: -50, y: -50, z: -50 }, max: { x: 50, y: 50, z: 50 } };
    const engine = (await generateViewDrawings([axo], meshes, LEVELS, extent)).get(axo.id);
    assert.ok(engine, 'the engine draws the view');
    assert.deepEqual(engine.cutPolygons, app.cutPolygons);
    assert.deepEqual(engine.lines, app.lines);
    assert.deepEqual(engine.bounds, app.bounds);
  });

  it('the generation worker draws what the main thread draws', async (t) => {
    if (!meshes) return t.skip('run pnpm build:wasm:fetch for the real model');
    const all = meshes;
    const axo = addCutaway();
    const generated: string[] = [];
    __setGenerationWorkerFactoryForTest(() => {
      const worker: GenerationWorker = {
        onmessage: null,
        onerror: null,
        postMessage(message, transfer) {
          const data = structuredClone(message, { transfer: transfer ?? [] });
          if (data.type === 'generate') generated.push(data.axonometric?.view.id ?? 'plane');
          void handle(data, (reply) => { const copy = structuredClone(reply); queueMicrotask(() => worker.onmessage?.({ data: copy })); });
        },
        terminate() {},
      };
      return worker;
    });
    const off = await generateDrawing({ allMeshes: all, meshes: all, ...axonometricJob(axo, LEVELS) }, undefined);
    assert.deepEqual(generated, [axo.id], 'the worker drew it');
    assert.deepEqual(timeless(off), timeless(await generateAxonometricDrawing(all, axo, LEVELS)));
  });
});
