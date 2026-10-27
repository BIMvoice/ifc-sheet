/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's frame as a drawing's live symbols need it (true north, the render frame's shift, the map) and the per-drawing context
 * built from it (`LiveSymbolContext`, `live-symbols.ts`). The app's sheet and the engine's PDF both build the context here; they
 * differ only in how they read the frame (the app from its stores, `siteplan/site-frame.ts`; the engine from the opened model,
 * `siteFrameOf`).
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { extractGeoreferencingOnDemand } from '@ifc-lite/parser';
import { hasStandardGeoreferencing } from './georef-gate.js';
import { drawingToWorld, type SectionAxisName, type Vec3 } from './drawing-frame.js';
import type { Pt } from './draft-types.js';
import type { LiveSymbolContext } from './live-symbols.js';
import type { OpenedModel } from './model.js';
import { sheetNumber } from './sheet-number.js';
import { gridNorthOf, northArrowRotation, trueNorthOf, type PlanDirection } from './true-north.js';
import type { SheetLocale } from './units-and-numbers.js';

export interface SiteFrame {
  /** True north in project XY: the model's TrueNorth, else grid north of its map conversion, else `null` (project north, +Y). */
  north: PlanDirection | null;
  /** A drawing point's Easting / Northing in metres; absent without a usable map conversion (the label then falls back to local X / Y). */
  mapPoint?: (plane: SectionPlaneConfig, p: Pt) => { e: number; n: number };
  /** The render frame's shift (`totalYupOffset`) of the model read, for local coordinates. */
  frameOffset: Vec3;
}

/** A drawing point in IFC project coordinates (metres): the viewer point with the render frame's shift added back, axes back to IFC's (x, -z). */
export function drawingPointToLocal(plane: SectionPlaneConfig, p: Pt, frameOffset: Vec3): { x: number; y: number } {
  const w = drawingToWorld(plane, p);
  return { x: w.x + frameOffset.x, y: -(w.z + frameOffset.z) };
}

/** Builds the coordinate label lines, given how to translate them. */
export type CoordinateLabeller = (kind: 'map' | 'local', a: string, b: string) => string[];

/** The labels in English (`site.coordinates.*` of the app's catalogues, which read the same in every language the app has). */
export const COORDINATE_LABELS: CoordinateLabeller = (kind, a, b) => (kind === 'map' ? [`E ${a}`, `N ${b}`] : [`X ${a} (local)`, `Y ${b} (local)`]);

/**
 * The live-symbol context of one drawing: shown at `scale`, on `plane`. `null` plane (no drawing yet): only the scale is known.
 */
export function liveSymbolContext(
  frame: SiteFrame, plane: SectionPlaneConfig | null | undefined, axis: SectionAxisName, scale: number,
  locale: SheetLocale, label: CoordinateLabeller,
): LiveSymbolContext {
  /** Map coordinates are printed to the centimetre, ungrouped. */
  const fmt = (v: number) => sheetNumber(locale, v, 2, { group: false });
  const coordinates = plane
    ? (p: Pt): string[] => {
        if (frame.mapPoint) {
          const m = frame.mapPoint(plane, p);
          return label('map', fmt(m.e), fmt(m.n));
        }
        const l = drawingPointToLocal(plane, p, frame.frameOffset);
        return label('local', fmt(l.x), fmt(l.y));
      }
    : null;
  return {
    scale,
    // No north stated: project north (+Y) is the model's only claim.
    north: plane ? northArrowRotation(plane, axis, frame.north ?? { x: 0, y: 1 }) : null,
    coordinates,
    format: (v) => sheetNumber(locale, v, 2, { trim: true }),
  };
}

/**
 * What the engine reads of the opened model's frame: true north, else grid north of its map conversion, as the app's `useSiteFrame`
 * does. A model with a usable map conversion (`hasStandardGeoreferencing`) is `georeferenced`: the app places its coordinates
 * through the anchor georeference (`lib/geo`), which the engine does not read, so a coordinate point on such a model is left out
 * rather than printed differently.
 */
export function siteFrameOf(model: Pick<OpenedModel, 'dataStore' | 'frameOffset'>): { frame: SiteFrame; georeferenced: boolean } {
  const georef = extractGeoreferencingOnDemand(model.dataStore);
  const georeferenced = hasStandardGeoreferencing(georef);
  const grid = georeferenced && georef?.mapConversion ? gridNorthOf(georef.mapConversion.xAxisAbscissa, georef.mapConversion.xAxisOrdinate) : null;
  return { frame: { north: trueNorthOf(model.dataStore) ?? grid, frameOffset: model.frameOffset }, georeferenced };
}
