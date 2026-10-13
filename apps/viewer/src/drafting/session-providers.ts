/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the drafting view in front installs for the session: the reference
 * shapes to snap to, the closed loops a hatch fills, where a level mark gets
 * its reference and number, the view's work plane and the pickers for model
 * elements. The session reads them back through the getters here.
 */

import type { ViewElement } from '@/labels/view-elements';
import type { PlanPart } from '@/dimall/types';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { ProjectView } from '@/project/types';
import type { LevelResolver } from './level-mark';
import type { DraftShape, LevelRef, Pt } from './types';

let referenceProvider: (min: Pt, max: Pt) => DraftShape[] = () => [];
/** Picks a model element under an idle click that hit no drafted entity (the view installs it). */
let modelPicker: ((p: Pt, tolerance: number, additive: boolean) => void) | null = null;
let loopProvider: () => Pt[][] = () => [];
let levelProvider: (p: Pt) => number = () => 0;
let levelRefProvider: (p: Pt) => LevelRef = (p) => ({ at: p });
let levelResolver: LevelResolver = (ref) => levelProvider(ref.at);
let planeProvider: () => SectionPlaneConfig | null = () => null;
let viewKindProvider: () => 'plan' | 'section' | 'elevation' | null = () => null;
let viewProvider: () => ProjectView | null = () => null;
/** The model element (renderer id) drawn under a drawing point, from the view in front. */
let elementPicker: (p: Pt) => number | null = () => null;

/** The shapes a view offers to snap to inside a box. */
export function setReferenceProvider(references: (min: Pt, max: Pt) => DraftShape[]): void {
  referenceProvider = references;
}
export const referenceShapesIn = (min: Pt, max: Pt): DraftShape[] => referenceProvider(min, max);

/** The view installs where hatch boundaries and level values come from. */
export function setAnnotationProviders(loops: () => Pt[][], levelAt: (p: Pt) => number): void {
  loopProvider = loops;
  levelProvider = levelAt;
}
export const closedLoopsOfView = (): Pt[][] => loopProvider();
export const levelAtPoint = (p: Pt): number => levelProvider(p);

/**
 * The view installs what a level mark measures: the reference a point gives
 * (a plan names its storey) and the number a reference reads. Without it a
 * point is its own reference and its number is `levelAt`.
 */
export function setLevelReferenceProviders(refAt: (p: Pt) => LevelRef, resolve: LevelResolver): void {
  levelRefProvider = refAt;
  levelResolver = resolve;
}

/** The number a level reference reads in the view in front (null when it cannot be resolved). */
export const resolveLevelRef: LevelResolver = (ref) => levelResolver(ref);
/** The reference a point has in the view in front. */
export const levelRefAt = (p: Pt): LevelRef => levelRefProvider(p);

/** The view installs its work plane and kind (work-plane commands need them). */
export function setWorkPlaneProvider(plane: () => SectionPlaneConfig | null, view: () => ProjectView | null): void {
  planeProvider = plane;
  viewProvider = view;
  viewKindProvider = () => {
    const kind = view()?.kind;
    return kind === 'plan' || kind === 'section' || kind === 'elevation' ? kind : null;
  };
}
export const viewKindOf = (): 'plan' | 'section' | 'elevation' | null => viewKindProvider();

/** The view in front and its work plane, as the commands see them. */
export const activeWorkPlane = (): { plane: SectionPlaneConfig | null; view: ProjectView | null } => ({ plane: planeProvider(), view: viewProvider() });

export function setModelPicker(picker: typeof modelPicker): void {
  modelPicker = picker;
}
export const hasModelPicker = (): boolean => modelPicker !== null;
export const pickModel = (p: Pt, tolerance: number, additive: boolean): void => modelPicker?.(p, tolerance, additive);

export function setElementPicker(picker: ((p: Pt) => number | null) | null): void {
  elementPicker = picker ?? (() => null);
}
export const modelElementAt = (p: Pt): number | null => elementPicker(p);

/** The model elements the view in front draws, with a point each to label them at. */
let viewElementsProvider: () => ViewElement[] = () => [];
export function setViewElementsProvider(provider: (() => ViewElement[]) | null): void {
  viewElementsProvider = provider ?? (() => []);
}
export const viewElementsOf = (): ViewElement[] => viewElementsProvider();

/** The walls, doors and windows the plan in front is cut through (`dimall/parts.ts`). */
let planPartsProvider: () => PlanPart[] = () => [];
export function setPlanPartsProvider(provider: (() => PlanPart[]) | null): void {
  planPartsProvider = provider ?? (() => []);
}
export const planPartsOf = (): PlanPart[] => planPartsProvider();
