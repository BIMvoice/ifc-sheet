/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's records that are not views or sheets: road drawings, building
 * materials, saved section cuts and typical sections. Part of the
 * project document (`types.ts`, which re-exports them).
 */

import type { AssemblySpec } from '@ifc-lite/create';
import type { SectionCapStyle, SectionPlane, SectionPlaneAxis } from '@/store/types';

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

/** How a building material draws where a view cuts it: one definition, with the engine (`@bimvoice/ifcsheet/materials`). */
export type { ProjectMaterial } from '@bimvoice/ifcsheet/materials';

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
