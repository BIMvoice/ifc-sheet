/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting command contract: a small state machine driven by the
 * session (`../session.ts`) from clicks, picks and the command line.
 * Commands never touch the stores directly except through `DraftContext`.
 */

import type { TranslationKey } from '@/i18n';
import type { TagFieldName } from '@/catalogue/types';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { ViewElement } from '@/labels/view-elements';
import type { PlanPart } from '@/dimall/types';
import type { RoomOfPlan } from '@/tagall/footprint';
import type { ProjectView } from '@/project/types';
import type { Box } from '../cross-ref-marks';
import type { ElementBox } from '../dimension-anchor';
import type { DraftEntity, DraftShape, LevelRef, Pt } from '../types';

export type StepResult = 'continue' | 'done';

export interface Prompt {
  key: TranslationKey;
  params?: Record<string, string | number>;
  /** Answers the step offers to click, besides typing: each is submitted as typed, with a count shown beside it. */
  choices?: readonly { value: string; count: number }[];
}

/** What a click on the drawing means at the current step. */
export type InputKind = 'point' | 'pick';

export interface DraftContext {
  viewId: string;
  layerId: string;
  /** The view's drafted entities on visible, unlocked layers. */
  entities(): DraftEntity[];
  /** Generated drawing lines near a region, as line shapes (trim/extend boundaries). */
  referenceShapes(min: Pt, max: Pt): DraftShape[];
  selection(): ReadonlySet<string>;
  setSelection(ids: ReadonlySet<string>): void;
  /** Closed loops a hatch can fill: drafted closed shapes and the drawing's cut outlines. */
  closedLoops(): Pt[][];
  /** The height (m) a level mark at this drawing point reports. */
  levelAt(p: Pt): number;
  /** What a level mark placed at `p` measures, and the number a reference reads. */
  levelRefAt(p: Pt): LevelRef;
  resolveLevel(ref: LevelRef): number | null;
  /** The view's work plane (world units), when known. */
  plane(): SectionPlaneConfig | null;
  /** The kind of view being drafted on. */
  viewKind(): 'plan' | 'section' | 'elevation' | null;
  /** The project view being drafted on. */
  view(): ProjectView | null;
  /** The model element (renderer id) drawn under a drawing point, or null. */
  elementAt(p: Pt): number | null;
  /** The elements the point is a corner of, nearest first, with their boxes in the view (a snapped dimension point stays attached to one). */
  elementBoxesAt?(p: Pt): ElementBox[];
  /** Every model element the view draws, with a point to label it at. */
  viewElements(): ViewElement[];
  /** The walls, doors and windows the plan is cut through, for DIMALL. */
  planParts(): PlanPart[];
  /** The boxes of what the plan draws over its cut (door leaves and swings, window frames, roofs, grid): what a ceiling tag keeps clear of. */
  planObstacles(): Box[];
  /** The rooms of the plan in front. */
  rooms(): RoomOfPlan[];
  /** +1, or −1 when the drawing is mirrored on screen (a user CCW angle is CW in drawing space). */
  orientation: 1 | -1;
  settings: DraftSettings;
  /** Echo a line into the command history. */
  say(key: TranslationKey, params?: Record<string, string | number>): void;
}

export interface DraftSettings {
  filletRadius: number;
  offsetDistance: number | null;
  /** Annotation text height, model metres. */
  textHeight: number;
  hatchPattern: string;
  hatchScale: number;
  hatchAngle: number;
  extrudeClass: string;
  extrudeDepth: number;
  roofKind: 'flat' | 'mono' | 'gable' | 'hip';
  /** Build a roof system (per-edge rules, covering and structure as parts) rather than one solid. */
  roofSystem: boolean;
  /** ROOF picks an existing closed contour (PICK) rather than drawing the roof's own outline (DRAW, the default). */
  roofPick: boolean;
  /** Degrees. */
  roofSlope: number;
  roofThickness: number;
  roofOverhang: number;
  /** AXIS: the next axis's label (it counts on: 1, 2… / A, B…), bubble, ends, bubble size (model metres; null: four text heights) and line type. */
  axisLabel: string;
  axisBubble: 'circle' | 'square';
  axisEnds: 'both' | 'start' | 'end' | 'none';
  axisSize: number | null;
  axisLineType: 'continuous' | 'dashed' | 'dotted' | 'dashdot';
  /** DIMALIGNED / DIMLINEAR chain further dimensions from the last end (the default) rather than stopping after one. */
  dimContinuous: boolean;
  /** The styles new annotations take. */
  currentTextStyle: string;
  currentDimStyle: string;
  /** TAG: what the label shows. */
  tagField: TagFieldName;
  /** The annotation type the next annotation of its tool is stamped with (`params.atype`), or null. */
  annotationType: { id: string; tool: string } | null;
  /** SYMBOL: the symbol placed, its scale factor and rotation (degrees). */
  symbolId: string | null;
  symbolScale: number;
  symbolRotation: number;
  /** MAKESYMBOL: the symbol to redefine from the selection, or null for a new one. */
  symbolTarget: string | null;
}

export interface DraftCommand {
  prompt(): Prompt;
  input(): InputKind;
  /** The rubber-band origin: ortho/polar and typed distances measure from it. */
  basePoint(): Pt | null;
  onPoint?(p: Pt): StepResult;
  onPick?(entity: DraftEntity, at: Pt): StepResult;
  /** A bare typed number when the step wants a value (radius, angle, distance) rather than a point. */
  wantsValue?(): boolean;
  onValue?(value: number): StepResult;
  /** The step wants free text (a note, a label): the whole line goes to `onText`. */
  wantsText?(): boolean;
  onText?(text: string): StepResult;
  /** A typed keyword (e.g. "C" to close); `undefined` if not understood. */
  onKeyword?(word: string): StepResult | undefined;
  onEnter?(): StepResult;
  preview?(cursor: Pt): DraftShape[];
}

export interface DraftCommandDef {
  id: string;
  /** Command-line names, upper case (the first is the canonical name). */
  aliases: string[];
  labelKey: TranslationKey;
  /** Modify commands act on a selection, gathered first when empty. */
  needsSelection?: boolean;
  create(ctx: DraftContext): DraftCommand;
  /** A command that needs no further input: it does its work when named, instead of `create`. `args` is what was typed after its name (only for a command that `takesArgs`). */
  run?(ctx: DraftContext, args: string): void;
  /** The command line may carry text after the name (`ISSUE svg P02`, `WHATCHANGED ACCEPT`). */
  takesArgs?: boolean;
  /** The command works on the project, not on the drawing in front: it runs with no view attached, and when typed it runs even while another tool is waiting for input. */
  projectWide?: boolean;
}
