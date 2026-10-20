/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project document's records and view drawing options: phases, the
 * structural grid, 3D rasters, revisions and issues. Split out of `types.ts`
 * to keep it under the module size rule; `types.ts` re-exports them, so
 * imports are unchanged.
 */

import type { CategoryLineWeight } from './types';

/** The phase of an element (`phases.ts`): IFC Status NEW, EXISTING, DEMOLISH, TEMPORARY. */
export type PhaseId = 'existing' | 'demolish' | 'new' | 'temporary';

/** How a phase draws: its line (colour, pen, dashed) and the fill of its cut faces. */
export interface PhaseStyle {
  lineColor: string;
  lineWeight: CategoryLineWeight;
  dashed: boolean;
  fillColor: string;
}

/** A view that draws by phase: which phases it shows, and the styles it changes from the default look. */
export interface ViewPhases {
  show: PhaseId[];
  styles?: Partial<Record<PhaseId, Partial<PhaseStyle>>>;
}

/** Which ends of a grid axis carry a bubble; on a section, `start` is the foot and `end` the head. */
export type GridEnds = 'start' | 'end' | 'both';

/** How a view draws the model's structural grid (IfcGrid). */
export interface ViewGridGraphics {
  /** Absent: on for plans and sections, off for elevations. */
  visible?: boolean;
  /** Absent: both ends. */
  ends?: GridEnds;
}

/** How a 3D view prints: an axonometric is parallel (a true scale), a perspective has none. */
export type ThreeDProjection = 'axonometric' | 'perspective';

/** The four isometric corners a model is seen from; the camera stands at that corner, 35.26 degrees up. */
export type AxonometricPreset = 'se' | 'sw' | 'ne' | 'nw';

/**
 * A raster capture of the 3D viewport, printed as an image on a sheet. Sized in
 * paper millimetres at print resolution, so it carries its own box.
 */
export interface ViewRaster {
  /** PNG data URL of the capture. */
  href: string;
  widthPx: number;
  heightPx: number;
  /** The paper box the capture was sized for, millimetres. */
  widthMm: number;
  heightMm: number;
}

/** One revision of the set: a letter or number, when, what changed, who made it. */
export interface ProjectRevision {
  id: string;
  /** `A`, `B`, `01`: what the title block reads. */
  code: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  description: string;
  by: string;
}

/** One sheet as it stood when a set was issued. */
export interface IssuedSheet {
  number: string;
  title: string;
  /** The scales of its viewports, as drawn on the list: `1:50`, or `1:50, 1:100`; empty when it holds none. */
  scale: string;
  /** The paper as named on the list (`paperLabel`): `A1`, `A3×3`, `500×700`. */
  paper: string;
  orientation: 'landscape' | 'portrait';
  revision: string;
  /** What the sheet held (`issue/fingerprint.ts`): equal fingerprints mean an unchanged sheet. */
  fingerprint: string;
}

/** A set of sheets sent out together, recorded with the project so a later issue can say what changed. */
export interface ProjectIssue {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  createdAt: number;
  sheets: IssuedSheet[];
}
