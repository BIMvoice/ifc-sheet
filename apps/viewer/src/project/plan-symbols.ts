/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plan symbols of the loaded models (#489) in a plan's drawing: an element or type that carries a 2D plan
 * representation (Plan / FootPrint or Annotation, read by the engine's `readPlanSymbols`) is drawn from it
 * instead of its 3D body. The drafting tab and every sheet viewport (so the PDF and the DXF too) take their drawing
 * through `withViewPlanSymbols`, and the headless engine calls the same two engine functions, so they agree.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { CoordinateInfo } from '@ifc-lite/geometry';
import { federationFrameInfo } from '@ifc-lite/geometry/world-frame';
import type { IfcDataStore } from '@ifc-lite/parser';
import { planSymbolsOn, readPlanSymbols, withPlanSymbols, type PlanSymbol } from '@bimvoice/ifcsheet/plan-symbols';
import { useViewerStore } from '@/store';
import { toGlobalIdFromModels } from '@/store/globalId';
import type { ProjectView, ViewGraphics } from './types';

/** Each store's symbols for the frame they were read in, held weakly so an unloaded model's go with it. */
const reads = new WeakMap<IfcDataStore, { frame: CoordinateInfo | null; symbols: Map<number, PlanSymbol> }>();

function symbolsOf(store: IfcDataStore, frame: CoordinateInfo | null): Map<number, PlanSymbol> {
  const known = reads.get(store);
  if (known && known.frame === frame) return known.symbols;
  const symbols = readPlanSymbols(store, frame).symbols;
  reads.set(store, { frame, symbols });
  return symbols;
}

/** The loaded models' plan symbols by renderer id, the id a drawing's lines and faces carry. */
export function loadedPlanSymbols(): Map<number, PlanSymbol> {
  const s = useViewerStore.getState();
  const frame = federationFrameInfo(s.models.values(), s.geometryResult);
  const out = new Map<number, PlanSymbol>();
  const entries: [string, IfcDataStore | null | undefined][] = s.models.size > 0
    ? [...s.models].map(([modelId, m]) => [modelId, m.ifcDataStore])
    : [['legacy', s.ifcDataStore]];
  for (const [modelId, store] of entries) {
    if (!store) continue;
    for (const symbol of symbolsOf(store, frame).values()) {
      const id = toGlobalIdFromModels(s.models, modelId, symbol.expressId);
      out.set(id, { ...symbol, expressId: id });
    }
  }
  return out;
}

/**
 * `drawing` of `view` with plan symbols in place of the bodies of the elements that have one; the drawing itself
 * for any other view, or when the view's graphics switch them off ("Use plan symbols from the model").
 */
export function withViewPlanSymbols(drawing: Drawing2D, view: Pick<ProjectView, 'kind'> | undefined, graphics: ViewGraphics | undefined): Drawing2D {
  if (view?.kind !== 'plan' || !planSymbolsOn(graphics)) return drawing;
  return withPlanSymbols(drawing, loadedPlanSymbols());
}
