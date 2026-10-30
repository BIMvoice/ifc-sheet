/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The door and window symbols of a plan view, made from a model and a project the way the app makes them (`project/view-symbols.ts`
 * and `plan-overlays.ts` there): the symbol each opening gets (`openingSymbols`: its mesh, the swing it states, the configured type
 * the model or the project's mapping gives it, the project's flips), what the view hides taken out, the detail level applied, and
 * the strokes grouped by pen (thin, heavy for a configured type's cut parts, dashed for what lies above the cut). The headless
 * sheets (`set-sheets.ts`, `sheet-graphic.ts`) and the app both call the functions here, so a plan shows the same symbols in both.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { Drawing2D, Point2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { clipPolyline } from './clip.js';
import type { Rect } from './sheet-frame.js';
import type { SheetPen } from './sheet-graphic.js';
import { flattenShape } from './symbols.js';
import { DASH_MM, type PenTable } from './view-style.js';
import type { DraftShape } from './draft-types.js';
import type { DetailLevel } from './detail-level.js';
import { elementShown } from './element-graphics.js';
import { doorOperationOf, type DoorOperation } from './door-operation.js';
import { drawnJoineryOf, typeIndex, type DrawnJoinery, type JoineryProject, type Live } from './joinery-schedule.js';
import { openingSymbols, type OpeningSymbol } from './opening-symbols.js';
import { hostedInCutWall, openingHostsOf } from './opening-hosts.js';
import { elevationOpeningSymbols, visibleEntities } from './elevation-openings.js';
import { hiddenClassesOf } from './view-templates.js';
import type { ViewGraphics } from './view-graphics-types.js';

/** Whether a plan draws an element from its symbol, not its cut: every door and window. */
export const drawnBySymbol = (ifcType: string | undefined): boolean => /^IFC(DOOR|WINDOW)/i.test(ifcType ?? '');

/**
 * A symbol at a detail level (#444). Fine is the symbol as it is. Coarse and medium simplify the opening: a window keeps its frame
 * and loses the glazing lines across it (when a closed frame is left), and the dashed parts (what lies above the cut) go. A door
 * keeps its leaf and its swing.
 */
export function simplifyOpeningSymbol(s: OpeningSymbol, detail: DetailLevel): OpeningSymbol {
  if (detail === 'fine') return s;
  const framed = [...s.shapes, ...(s.heavy ?? [])].some((x) => x.type === 'polyline' && x.closed);
  const shapes = s.kind === 'window' && framed ? s.shapes.filter((x) => x.type !== 'line') : s.shapes;
  const { dashed: _dashed, ...rest } = s;
  return { ...rest, shapes };
}

/** What a plan's openings are read with: the model's own store and the project's catalogue, mapping and flips. */
export interface OpeningSources {
  live: Live;
  project: JoineryProject;
}

/** The configured joinery and the stated swing of an opening, by the express id its mesh carries; each model's types are read once. */
export function openingReads(sources: OpeningSources): { typedOf: (id: number) => DrawnJoinery | null; operationOf: (id: number) => DoorOperation | null; flipsOf: (id: number) => number } {
  let types: Map<number, number | null> | undefined;
  const typesOf = () => (types ??= typeIndex(sources.live));
  const globalIdOf = (id: number): string | undefined => sources.live.dataStore.entities?.getGlobalId(id) || undefined;
  const typedMemo = new Map<number, DrawnJoinery | null>();
  const opMemo = new Map<number, DoorOperation | null>();
  return {
    typedOf: (id) => {
      if (!typedMemo.has(id)) typedMemo.set(id, drawnJoineryOf(sources.live, id, sources.project, typesOf()));
      return typedMemo.get(id) ?? null;
    },
    operationOf: (id) => {
      if (!opMemo.has(id)) {
        let op: DoorOperation | null = null;
        // An unreadable operation draws the default hand, as in the app (`door-operation-read.ts`).
        try { op = doorOperationOf(sources.live, id, typesOf().get(id) ?? null); } catch { op = null; }
        opMemo.set(id, op);
      }
      return opMemo.get(id) ?? null;
    },
    flipsOf: (id) => {
      const guid = Object.keys(sources.project.symbolFlips ?? {}).length > 0 ? globalIdOf(id) : undefined;
      return guid ? sources.project.symbolFlips?.[guid] ?? 0 : 0;
    },
  };
}

/**
 * The opening symbols of a plan cut at `plane`, before the detail level: of the meshes the view shows (an element it hides one by one
 * has no swing) and the classes it leaves visible. Empty for any plane but a horizontal one.
 */
export function planOpeningSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, sources: OpeningSources, graphics: ViewGraphics | undefined,
): OpeningSymbol[] {
  if (plane.axis !== 'y' || plane.customPlane) return [];
  const hidden = hiddenClassesOf(graphics);
  const globalIdOf = (id: number): string | undefined => sources.live.dataStore.entities?.getGlobalId(id) || undefined;
  const shown = meshes.filter((m) => drawnBySymbol(m.ifcType) && elementShown(graphics, globalIdOf(m.expressId), m.ifcType));
  const reads = openingReads(sources);
  const hosts = openingHostsOf(sources.live.dataStore);
  return openingSymbols(shown, plane, reads.flipsOf, reads.typedOf, reads.operationOf, hostedInCutWall(meshes, (id) => hosts.get(id)))
    .filter((s) => !hidden.has(s.kind === 'door' ? 'IFCDOOR' : 'IFCWINDOW'));
}

/**
 * The opening symbols of an elevation or section drawn as `drawing`, before the detail level: of the doors and windows the drawing
 * shows and the classes it leaves visible. Empty for a plan and for a custom plane.
 */
export function viewOpeningSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, drawing: Pick<Drawing2D, 'lines'>, sources: OpeningSources, graphics: ViewGraphics | undefined,
): OpeningSymbol[] {
  return elevationOpeningSymbols(meshes, plane, visibleEntities(drawing), hiddenClassesOf(graphics), openingReads(sources), sources.project.openingLines);
}

/** One pen of the symbols: its weight, whether it is dashed, and the shapes drawn with it. */
export interface OpeningPen { weight: 'thin' | 'heavy'; dashed: boolean; shapes: DraftShape[] }

/** The symbols' shapes by pen, in the app's order: thin, heavy, dashed (`symbolOverlays`); an empty pen is left out. */
export function openingPens(symbols: readonly OpeningSymbol[]): OpeningPen[] {
  const thin: DraftShape[] = [], heavy: DraftShape[] = [], dashed: DraftShape[] = [];
  for (const s of symbols) {
    thin.push(...s.shapes);
    if (s.heavy) heavy.push(...s.heavy);
    if (s.dashed) dashed.push(...s.dashed);
  }
  return ([{ weight: 'thin', dashed: false, shapes: thin }, { weight: 'heavy', dashed: false, shapes: heavy }, { weight: 'thin', dashed: true, shapes: dashed }] as OpeningPen[]).filter((p) => p.shapes.length > 0);
}

/** `drawing` without the faces and lines of the doors and windows: a plan draws them from their symbols. */
export function withoutOpeningBodies<D extends Drawing2D>(drawing: D): D {
  const keep = <T extends { ifcType?: string }>(rows: T[]): T[] => rows.filter((r) => !drawnBySymbol(r.ifcType));
  return {
    ...drawing,
    lines: keep(drawing.lines), cutPolygons: keep(drawing.cutPolygons), projectionPolygons: keep(drawing.projectionPolygons),
    ...(drawing.layerBaseCutPolygons ? { layerBaseCutPolygons: keep(drawing.layerBaseCutPolygons) } : {}),
  };
}

/**
 * The symbols as the sheet's pens, as the app's sheet draws its `SYMBOLS` overlays: black, the thin pen the hatch pen, a configured
 * type's cut parts the cut pen, the parts above the cut dashed. `at` puts a drawing point on the paper and the runs are clipped to `box`.
 */
export function openingSheetPens(symbols: readonly OpeningSymbol[], detail: DetailLevel, pens: PenTable, at: (p: Point2D) => Point2D, box: Rect): SheetPen[] {
  return openingPens(symbols.map((s) => simplifyOpeningSymbol(s, detail))).map((pen) => ({
    layer: 'SYMBOLS' as const, stroke: '#000000', fill: null, regions: [], width: pen.weight === 'heavy' ? pens.pens.cut : pens.pens.hatch,
    ...(pen.dashed ? { dash: DASH_MM } : {}),
    runs: pen.shapes.flatMap((shape) => {
      const flat = flattenShape(shape);
      const pts = flat.pts.map(at);
      return clipPolyline(flat.closed ? [...pts, pts[0]] : pts, box);
    }),
  }));
}
