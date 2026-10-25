/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a view draws the model: category styles, phases and the structural
 * grid (`view-graphics.ts` applies them). Part of the project document
 * (`document.ts`, which re-exports them).
 */

import type { ColourScheme } from './colour-scheme.js';

export type CategoryLineWeight = 'heavy' | 'medium' | 'light' | 'hairline';

/** How one element category draws in a view. Absent fields keep the preset's look. */
export interface CategoryGraphics {
  visible?: boolean;
  lineColor?: string;
  fillColor?: string;
  lineWeight?: CategoryLineWeight;
  /** A hatch pattern name (built-in or imported .pat) drawn over the category's cut faces. */
  cutHatch?: string;
  /** Hatch scale (1 = the pattern's own size in drawing millimetres). */
  hatchScale?: number;
}

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
  /** To demolish draws in the existing style (a survey: the building as it stands). */
  demolishAsExisting?: boolean;
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

export interface ViewGraphics {
  /** The structural grid's axes and bubbles. */
  grid?: ViewGridGraphics;
  /** A built-in graphic override preset id; absent = the default, null = none. */
  presetId?: string | null;
  /** Absent: the view draws every element alike, whatever its phase. */
  phases?: ViewPhases;
  /** By category id (`VIEW_CATEGORIES`). */
  categories?: Record<string, CategoryGraphics>;
  /** The view coloured by a property (`colour-scheme.ts`, #92). Absent: not coloured. */
  colourScheme?: ColourScheme;
}
