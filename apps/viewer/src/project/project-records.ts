/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's records that are not views or sheets: road drawings, building
 * materials, saved section cuts, typical sections and issues. Part of the
 * project document (`types.ts`, which re-exports them).
 */

import type { AssemblySpec } from '@ifc-lite/create';
import type { SectionCapStyle, SectionPlane, SectionPlaneAxis } from '@/store/types';
import type { CategoryLineWeight, PaperSize } from './types';

/** A road drawing (longitudinal profile or cross-section set) of a corridor: a project document of its own, placeable on sheets or drawn on a plan. */
export interface ProjectCivilDrawing {
  id: string;
  name: string;
  kind: 'profile' | 'sections';
  createdAt: number;
  /** The corridor it draws, by GlobalId (in whichever loaded model has it). */
  corridorGlobalId: string;
  /** Drawing scale denominator (profile: horizontal). */
  scale: number;
  /** Profile: vertical exaggeration, grid steps. */
  vExaggeration?: number;
  stationStep?: number;
  elevationStep?: number;
  /** Sections: sample spacing or explicit stations, layout columns, half width shown (0: automatic). */
  every?: number;
  stations?: number[];
  columns?: number;
  halfWidth?: number;
}

/**
 * How a building material draws where a view cuts it (ArchiCAD's Building
 * Materials): matched by IfcMaterial name. `hatch` null draws no hatch,
 * absent takes the default its name suggests; a membrane (or any layer under
 * 2 mm) draws as a heavy dashed line instead of a band.
 */
export interface ProjectMaterial {
  id: string;
  name: string;
  hatch?: string | null;
  /** 1 = the pattern's own size. */
  hatchScale?: number;
  /** Cut fill colour; null: none (white), absent: the material's IFC colour. */
  fill?: string | null;
  /** Pen of the hatch lines. */
  hatchPen?: CategoryLineWeight;
  membrane?: boolean;
}

/** The subset of a section plane that defines the cut itself, not its on-screen lifecycle. */
export interface SavedSectionCutPlane {
  axis: SectionPlaneAxis;
  position: number;
  flipped: boolean;
  custom?: SectionPlane['custom'];
  capStyle: SectionCapStyle;
  showCap: boolean;
  showOutlines: boolean;
}

/** A named section cut kept in the project, to put back on screen later. */
export interface SavedSectionCut {
  id: string;
  name: string;
  plane: SavedSectionCutPlane;
  createdAt: number;
  updatedAt: number;
}

/** A typical road cross-section (assembly) kept in the project's library. */
export interface ProjectTypicalSection {
  id: string;
  name: string;
  assembly: AssemblySpec;
}

/** One sheet as it stood when a set was issued. */
export interface IssuedSheet {
  number: string;
  title: string;
  /** The scales of its viewports, as drawn on the list: `1:50`, or `1:50, 1:100`; empty when it holds none. */
  scale: string;
  paper: PaperSize;
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
