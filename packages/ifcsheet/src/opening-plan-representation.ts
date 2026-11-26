/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door's or window's own 2D plan representation drawn in place of the symbol generated for it (#831). Bonsai writes a door's leaf
 * and swing arc (a trimmed ellipse) and a window's frame and glazing as `Body` / Curve2D in a Plan / PLAN_VIEW context, mapped from the
 * type; Revit 2011 writes `Plan` / GeometricSet. `readPlanSymbols(store, frame, 'openings')` reads them, placed by the element's
 * placement in the render frame; here they replace the generated symbol, unclipped, in its pens: a door's leaf and frame heavy and its
 * swing thin, a window thin (`opening-plan-rep-pens.ts`).
 *
 * One or the other, never both. A configured joinery type (the user's own, or the project's mapping) still wins over the model's
 * representation. A representation that is clearly unusable falls back to the generated symbol: one with no line longer than a
 * millimetre, or one lying off the generated symbol by more than that symbol's size, or more than three times its size (a symbol
 * read in the wrong units or the wrong frame). The view setting "Use plan symbols from the model" (`usePlanSymbols`, `planSymbolsOn`)
 * switches it off with the other plan symbols. The engine (`planOpeningSymbols`) and the app (`viewOpeningSymbols`) both call this.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { RenderFrameInfo } from '@ifc-lite/geometry/world-frame';
import type { IfcDataStore } from '@ifc-lite/parser';
import { worldToDrawing } from './drawing-frame.js';
import { flattenShape } from './symbols.js';
import { readPlanSymbols, type PlanSymbol } from './plan-symbols.js';
import { symbolShapes, type OpeningSymbol } from './opening-symbols.js';
import type { Pt } from './draft-types.js';
import { doorStrokePens } from './opening-plan-rep-pens.js';

/** Each store's door and window plan symbols for the frame they were read in, held weakly. */
const reads = new WeakMap<IfcDataStore, { frame: RenderFrameInfo | null; symbols: Map<number, PlanSymbol> }>();

/** The doors' and windows' own plan symbols of `store` by express id (`readPlanSymbols(…, 'openings')`), read once per store and frame. */
export function openingPlanSymbolsOf(store: IfcDataStore, frame: RenderFrameInfo | null): ReadonlyMap<number, PlanSymbol> {
  const held = reads.get(store);
  if (held && held.frame === frame) return held.symbols;
  const symbols = readPlanSymbols(store, frame, 'openings').symbols;
  reads.set(store, { frame, symbols });
  return symbols;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

function boxOf(points: readonly Pt[]): Box | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The smallest line a representation must hold to be drawn, in metres. */
const MIN_LINE = 0.001;

/**
 * Whether `lines` (the representation in the plan's frame) can stand for the generated symbol `made`: it holds a line longer than a
 * millimetre, its extent is at most three times the symbol's, and its middle lies within the symbol's size of the symbol's middle.
 */
export function usableRepresentation(lines: readonly Pt[][], made: OpeningSymbol): boolean {
  const length = (l: readonly Pt[]) => l.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p.x - l[i - 1].x, p.y - l[i - 1].y)), 0);
  if (!lines.some((l) => length(l) > MIN_LINE)) return false;
  const own = boxOf(lines.flat()), ref = boxOf(symbolShapes(made).flatMap((s) => flattenShape(s).pts));
  if (!own || !ref) return false;
  const size = Math.max(ref.x1 - ref.x0, ref.y1 - ref.y0, MIN_LINE);
  const spread = Math.max(own.x1 - own.x0, own.y1 - own.y0);
  const off = Math.hypot((own.x0 + own.x1 - ref.x0 - ref.x1) / 2, (own.y0 + own.y1 - ref.y0 - ref.y1) / 2);
  return spread <= 3 * size && off <= size;
}

/**
 * `symbols` (`openingSymbols`' for a plan cut at `plane`) with each element that has its own plan representation (`own`, by the id the
 * symbols carry) and no configured type (`configured`) drawn from it instead: its curves in the generated symbol's pens, per segment (`doorStrokePens`). `fellBack` lists the ids whose
 * representation was unusable (`usableRepresentation`), which keep the generated symbol.
 */
export function withOwnPlanRepresentations(
  symbols: readonly OpeningSymbol[], plane: SectionPlaneConfig, own: (id: number) => PlanSymbol | undefined, configured: (id: number) => boolean,
): { symbols: OpeningSymbol[]; fellBack: number[] } {
  const fellBack: number[] = [];
  const out = symbols.map((made) => {
    const symbol = configured(made.id) ? undefined : own(made.id);
    if (!symbol) return made;
    const lines = symbol.curves.map((curve) => curve.map((p) => worldToDrawing(plane, p)));
    if (!usableRepresentation(lines, made)) {
      fellBack.push(made.id);
      return made;
    }
    // A door's leaf and frame in the generated leaf's heavy pen, its swing and the rest thin; a window thin throughout (`opening-plan-rep-pens.ts`).
    const drawn = lines.filter((l) => l.length >= 2);
    const pens = made.kind === 'door' ? doorStrokePens(drawn) : { heavy: [], thin: drawn };
    const polyline = (pts: Pt[]) => ({ type: 'polyline' as const, closed: false, pts });
    const heavy = pens.heavy.map(polyline);
    return { id: made.id, kind: made.kind, shapes: pens.thin.map(polyline), ...(heavy.length > 0 ? { heavy } : {}) };
  });
  return { symbols: out, fellBack };
}
