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

/** The phases in the order a view lists them. */
export const PHASES = ['existing', 'demolish', 'new', 'temporary'] as const satisfies readonly PhaseId[];

/** A property of the project's own that says the phase, and what each of its values means. */
export interface PhaseMapping {
  set: string;
  property: string;
  /** Property value (compared without case) → phase. */
  values: Record<string, PhaseId>;
}

export interface PhaseSource {
  mapping?: PhaseMapping;
  /** The phase of an element that says none. Absent: EXISTING. */
  unmarked?: PhaseId;
}

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

/** A model element's IFC GlobalId: the key a view uses for anything it says about one element, so it survives a model reload. */
export type GlobalId = string;

/** How a line is drawn: one pattern, or a dash. */
export type ElementLineStyle = 'solid' | 'dashed';

/**
 * How ONE element draws in ONE view (#32). It lies over its category's graphics (and the template's): a field left out keeps what
 * the category gives. The cut and the projection (the lines seen beyond the cut) take a weight each.
 */
export interface ElementGraphics {
  /** `true` shows an element its category hides; `false` hides it (the same as listing it in `hiddenElements`). */
  visible?: boolean;
  lineColor?: string;
  fillColor?: string;
  cutWeight?: CategoryLineWeight;
  projectionWeight?: CategoryLineWeight;
  lineStyle?: ElementLineStyle;
  /** A hatch pattern name drawn over the element's cut faces. */
  cutHatch?: string;
  hatchScale?: number;
  /** What the element was called when this was set ("IfcWall Basement wall"): how an orphan is recognised once the model no longer has it. */
  about?: string;
}

/** What a style rule says of the items it matches. A material rule uses `fillColor`, `cutHatch` and `hatchScale` only (a material is a cut band, a face: its outline stays the element's). */
export interface StyleRuleStyle {
  lineColor?: string;
  fillColor?: string;
  lineWeight?: CategoryLineWeight;
  /** A hatch pattern name drawn over the matched cut faces. */
  cutHatch?: string;
  hatchScale?: number;
}

/**
 * One line of a view template's mapping (#31): everything of an IFC class (`by: 'class'`, `match` the class names, `IfcWall` also
 * taking `IfcWallStandardCase`) or of a building material (`by: 'material'`, `match` the IfcMaterial names, case and spacing aside)
 * draws like `style`. Listed groups ("load-bearing masonry" = several names) are one rule with several `match` entries.
 */
export interface StyleRule {
  id: string;
  by: 'class' | 'material';
  match: string[];
  style: StyleRuleStyle;
}

import type { DetailLevel } from './detail-level.js';

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
  /** An elevation or section that fills its visible surfaces with the colours of the model's materials (#499), under the linework. Absent or false: the line and hatch styles alone. A view template carries it. */
  colouredSurfaces?: boolean;
  /**
   * A plan draws the 2D plan symbol of an element or its type (a Plan / FootPrint or Annotation representation, `plan-symbols.ts`) in place
   * of the element's cut or projection. Absent or `true`: it does; `false` forces the 3D cut. The view's own, never a template's.
   */
  usePlanSymbols?: boolean;
  /** Elements hidden in this view, by GlobalId (#33). The 3D view's hide / isolate state is not followed. */
  hiddenElements?: GlobalId[];
  /** Per-element overrides, by GlobalId (#32): the most specific layer, over the category's. */
  elements?: Record<GlobalId, ElementGraphics>;
  /** Single lines of the model drawing hidden in this view (#33): `<GlobalId>|<key>` (`lineKey`), never an index into the drawing. */
  hiddenLines?: string[];
  /**
   * The class and material mapping of a view TEMPLATE (#31); `resolveViewGraphics` reads it from the template only (a view's own, left by detaching
   * from a template, is used when it follows none). Layers (`view-style.ts`): the template's category graphics < class rules < material rules < the view's own
   * category graphics.
   */
  styleRules?: StyleRule[];
  /**
   * The detail level of the view (#444): coarse draws walls, slabs and roofs by their outline, fine every material layer. Absent: it
   * follows the scale (`defaultDetailLevel`). A template carries it; a view's own overrides it.
   */
  detailLevel?: DetailLevel;
}

/** The graphics a view draws with, as `resolveViewGraphics` resolves them: the view's own, plus what only a resolution knows. */
export interface ResolvedViewGraphics extends ViewGraphics {
  /** Set with a template's `styleRules`: the view's OWN category graphics, which beat the mapping (`categories` holds the template's under them). */
  ownCategories?: Record<string, CategoryGraphics>;
}
