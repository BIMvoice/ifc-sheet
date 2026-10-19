/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A real IFC through the real pipeline up to a styled plan, for the discipline
 * plan tests: the parser, the wasm geometry engine, the section generator and
 * `styledDrawing` with the view's own omit predicate (`viewOmits`), the pieces
 * a drawing tab and a sheet put together. The plane and the projection bands
 * are the ones `ViewDrawingHost` / `useDrawingGeneration` derive for a plan
 * with a manual view depth (`sectionPlaneForView`, `viewDisplayOverrides`).
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSectionConfig, Drawing2DGenerator, type Drawing2D } from '@ifc-lite/drawing-2d';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { IfcParser } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import { useProjectStore } from '@/project/project-store';
import { levelsFromStoreys } from '@/project/view-defaults';
import { sectionPlaneForView } from '@/project/view-plane';
import { viewDisplayOverrides } from '@/project/view-drawings';
import { styledDrawing } from '@/project/view-graphics';
import { partHostType } from '@/project/part-host';
import { viewOmits } from '@/project/discipline-facts';
import { drawnBySymbol } from '@/project/view-symbols';
import type { ProjectLevel, ProjectView } from '@/project/types';

export interface LoadedPlanModel {
  levels: ProjectLevel[];
  /** The model's elements by Name, express id (= renderer id here). */
  idsByName: Map<string, number>;
  nameOf: (id: number) => string;
  /** `IfcWall`… of a model element. */
  classOf: (id: number) => string;
  /**
   * The view as it draws: with its own omit predicate (`viewOmits`, the default), with the one a view had before
   * discipline plans existed (`main`: a plan leaves out what a symbol draws), or with none.
   */
  planOf: (view: ProjectView, options?: { omits?: 'view' | 'main' | 'none' }) => Promise<Drawing2D>;
  /** Names of the model elements that have a cut face or a line in `drawing`. */
  drawnNames: (drawing: Drawing2D) => Set<string>;
  /** Classes of the model elements that have a cut face or a line in `drawing`. */
  drawnClasses: (drawing: Drawing2D) => Set<string>;
  /** Element ids that have a cut face or a line in `drawing`. */
  drawnIds: (drawing: Drawing2D) => Set<number>;
}

/**
 * Let the wasm engine load under happy-dom: `@ifc-lite/geometry` reads the
 * `.wasm` off disk only without a `window`, and happy-dom's `fetch` refuses
 * `file:` (same shim as `useDrawingGeneration.projection.test.tsx`).
 */
function serveWasmFromDisk(): void {
  const upstream = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
    if (href.startsWith('file:')) return new Response(await readFile(fileURLToPath(href)), { headers: { 'content-type': 'application/wasm' } });
    return upstream(input, init);
  };
  Reflect.deleteProperty(WebAssembly, 'instantiateStreaming');
}

export async function loadPlanModel(path: string): Promise<LoadedPlanModel> {
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ds = await new IfcParser().parseColumnar(buffer);
  serveWasmFromDisk();
  const processor = new GeometryProcessor();
  await processor.init();
  const geometry = await processor.process(new Uint8Array(buffer));
  const maxExpressId = Math.max(...geometry.meshes.map((m) => m.expressId));
  useViewerStore.setState({
    models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: ds, geometryResult: geometry, visible: true, idOffset: 0, maxExpressId }]]),
  } as never);
  const levels = levelsFromStoreys(modelLevels('m'));
  useProjectStore.setState({ levels });

  const idsByName = new Map<string, number>();
  for (const mesh of geometry.meshes) idsByName.set(ds.entities.getName(mesh.expressId), mesh.expressId);
  const nameOf = (id: number) => ds.entities.getName(id);
  const classOf = (id: number) => ds.entities.getTypeName(id);
  const bounds = geometry.coordinateInfo.shiftedBounds;

  const AXIS = { down: 'y', front: 'z', side: 'x' } as const;
  const planOf: LoadedPlanModel['planOf'] = async (view, options) => {
    const resolved = sectionPlaneForView(view, bounds, levels);
    if (!resolved) throw new Error('the view does not resolve');
    const axis = AXIS[resolved.axis];
    const range = bounds.max[axis] - bounds.min[axis];
    const position = bounds.min[axis] + (resolved.position / 100) * range;
    // A plan sees down its manual view depth and up to the model's top; any other view projects through the whole model.
    const { constructionProjectionDepth } = viewDisplayOverrides(view);
    const below = view.kind === 'plan' ? constructionProjectionDepth ?? 0 : range;
    const above = view.kind === 'plan' ? Math.max(range, 1e-3) : 1e-3;
    const generator = new Drawing2DGenerator();
    await generator.initialize();
    const config = createSectionConfig(axis, position, {
      projectionDepth: below, clipProjectionBands: true, projectionBelowDepth: below, projectionAboveDepth: above, includeHiddenLines: true, scale: 100,
    });
    config.plane.flipped = resolved.flipped;
    const raw = await generator.generate(geometry.meshes, config, { includeHiddenLines: true, includeProjection: true, includeEdges: true, mergeLines: true });
    const omits = options?.omits ?? 'view';
    const omit = omits === 'none' ? undefined : omits === 'main' ? (view.kind === 'plan' ? drawnBySymbol : undefined) : viewOmits(view);
    return styledDrawing(raw, view.graphics, partHostType, omit, null);
  };
  const drawnIds = (drawing: Drawing2D) => new Set<number>([...drawing.cutPolygons.map((p) => p.entityId), ...drawing.lines.map((l) => l.entityId)]);
  const drawnNames = (drawing: Drawing2D) => new Set([...drawnIds(drawing)].map(nameOf).filter(Boolean));
  const drawnClasses = (drawing: Drawing2D) => new Set([...drawnIds(drawing)].map(classOf).filter(Boolean));
  return { levels, idsByName, nameOf, classOf, planOf, drawnNames, drawnClasses, drawnIds };
}
