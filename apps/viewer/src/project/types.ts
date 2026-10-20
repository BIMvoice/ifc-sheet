/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ModelSnapshot } from '@/whatchanged/snapshot';
import type { JoineryMapping } from '@/joinery/symbol-mapping';
import type { AssemblySpec, JoinerySpec, StructureProfile } from '@ifc-lite/create';
import type { ElementTypeKind, ElementTypeSpec } from '@/element-types/spec';
import type { DimStyle, LayerGroup, TextStyle } from '@/drafting/styles';
import type { AnnotationType, DraftSymbol, ProjectLegend } from '@/catalogue/types';
import type { TagFieldConfig } from '@/tagfields/tag-fields';
import type { CadLayerRule } from './cad-layers';
import type { DisciplineId } from './discipline-views';

/**
 * The project document: the views and sheets a user organises over the
 * loaded models, Revit/ArchiCAD style. A view is a persistent project
 * object; opening one only points the live section / camera at it. The
 * whole document round-trips through the `.ifclite-project.json` sidecar
 * file kept next to the IFC files (`project-file.ts`).
 */

import type { CameraViewpoint, SectionCapStyle, SectionPlane, SectionPlaneAxis } from '@/store/types';
import type { CustomSectionPlane } from '@/store/section-types';
import type { DraftEntity, DraftLayer } from '@/drafting/types';

export type ProjectViewKind = 'plan' | 'section' | 'elevation' | '3d';

/** The facade an elevation looks at (project north = IFC +Y). */
export type ElevationDirection = 'north' | 'south' | 'east' | 'west';

/** A building level, merged across federated models at the same elevation. */
export interface ProjectLevel {
  name: string;
  /** Floor elevation, metres, in the same frame the section bar uses. */
  elevation: number;
  /** IfcBuildingStorey GlobalIds (one per model that has this level). */
  storeyGlobalIds: string[];
}

interface ProjectViewBase {
  id: string;
  name: string;
  /** Created by the default-view generator rather than the user. */
  auto?: boolean;
  createdAt: number;
  /**
   * View depth: how far beyond the cut plane the view sees, metres. `null`
   * or absent is the view kind's default — a plan shows the cut only, a
   * section / elevation projects with the automatic depth bands.
   */
  viewDepth?: number | null;
  /**
   * Draw the lines that are hidden behind other geometry, dashed. Absent:
   * an elevation does not (it shows what is seen from outside), every other
   * view does.
   */
  showHidden?: boolean;
  /**
   * Set on a detail view: the area of its source view it shows, in the source's
   * drawing metres. The detail is otherwise a copy of its source (same cut,
   * same depth), shown at a larger scale and cropped to `min`..`max`.
   */
  detail?: ViewDetail;
  /** The view's own graphics (Visibility / Graphics): a preset and per-category overrides. */
  graphics?: ViewGraphics;
  /** Drawing scale denominator (100 = 1:100). Annotation sizes follow it; absent = 1:100. */
  scale?: number;
  /** Drafting layers this view hides (by id), over their own switches. */
  hiddenLayers?: string[];
}

/** The area a detail view shows of its source view. */
export interface ViewDetail {
  /** The view the area was marked on. */
  of: string;
  /** Corners of the area, drawing metres, `min` below and left of `max`. */
  min: { x: number; y: number };
  max: { x: number; y: number };
  /** The detail's number (1, 2, …), unique among the project's details. */
  number: number;
}

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
  /** By category id (`VIEW_CATEGORIES`). */
  categories?: Record<string, CategoryGraphics>;
}

export interface PlanProjectView extends ProjectViewBase {
  kind: 'plan';
  level: ProjectLevel;
  /** Cut height above the level's floor, metres. */
  cutHeight: number;
  /** A discipline plan (structural, foundation, roof): it draws only the elements its discipline keeps (`discipline-views.ts`). */
  discipline?: DisciplineId;
  /**
   * A reflected ceiling plan: the same plan, looking up from the cut. It keeps
   * the floor plan's x/y (a point sits where it does in the plan below) and
   * draws what is above the cut: ceilings, soffits, lights, beams.
   */
  reflected?: boolean;
}

/** A section cut stored in world metres, independent of the model bounds. */
export interface SectionProjectPlane {
  axis: SectionPlaneAxis;
  /** World coordinate along the axis, metres (viewer frame). */
  offset: number;
  flipped: boolean;
  custom?: CustomSectionPlane;
}

export interface SectionProjectView extends ProjectViewBase {
  kind: 'section';
  plane: SectionProjectPlane;
  /** What the cut passes through, for people ("Through the stair"); set on proposed sections. */
  through?: string;
}

export interface ElevationProjectView extends ProjectViewBase {
  kind: 'elevation';
  /** The facade it looks at; on an interior elevation, the side of the room its wall is on (it looks that way). */
  direction: ElevationDirection;
  /**
   * World coordinate, metres, of the plane on its axis (z for north and
   * south, x for east and west). Absent: the plane sits just inside the whole
   * model's box on that facade.
   */
  planeOffset?: number;
  /** Set on an interior elevation: one wall of a room, seen from inside it. Its plane replaces `direction` / `planeOffset`. */
  interior?: InteriorElevation;
}

/** One wall face of a room, looked at from inside the room (`interior-elevations.ts`). */
export interface InteriorElevation {
  /** The room's IfcSpace GlobalId. */
  room: string;
  /** Parallel to the wall face, inside the room, looking at the face; world metres like a section's plane. */
  plane: SectionProjectPlane;
  /** The wall face in drawing metres: its length across, the room's floor to its top up. The drawing is cropped to it. */
  crop: { min: { x: number; y: number }; max: { x: number; y: number } };
}

/** How a 3D view prints: an axonometric is parallel (a true scale), a perspective has none. */
export type ThreeDProjection = 'axonometric' | 'perspective';

/** The four isometric corners a model is seen from; the camera stands at that corner, 35.26 degrees up. */
export type AxonometricPreset = 'se' | 'sw' | 'ne' | 'nw';

/** A raster capture of the 3D viewport, printed as an image on a sheet. Sized in paper millimetres at print resolution, so it carries its own box. */
export interface ViewRaster {
  /** PNG data URL of the capture. */
  href: string;
  widthPx: number; heightPx: number;
  /** The paper box the capture was sized for, millimetres. */
  widthMm: number; heightMm: number;
}

export interface ThreeDProjectView extends ProjectViewBase {
  kind: '3d';
  /** `null` means "the default 3D view": fit the whole model. */
  viewpoint: CameraViewpoint | null;
  /** How the view prints. Absent: an orthographic `viewpoint` is an axonometric, anything else a perspective. */
  projection?: ThreeDProjection;
  /** An axonometric seen from a preset corner instead of a saved camera; wins over `viewpoint`'s direction. */
  preset?: AxonometricPreset;
  /** Print as a raster capture of the viewport (always so for a perspective). Absent on an axonometric: vector hidden-line. */
  raster?: ViewRaster | null;
  /** An axonometric printed as a shaded raster instead of vector lines. */
  shaded?: boolean;
}

export type ProjectView = PlanProjectView | SectionProjectView | ElevationProjectView | ThreeDProjectView;

/** A view as handed to `addProjectView`: the store assigns `createdAt` (and `id` unless given). */
export type NewProjectView = ProjectView extends infer V
  ? V extends ProjectView ? Omit<V, 'id' | 'createdAt'> & { id?: string } : never
  : never;

/** A settings change for one view kind (`updateProjectView`); id and kind never change. */
export type ProjectViewPatch = ProjectView extends infer V
  ? V extends ProjectView ? Partial<Omit<V, 'id' | 'kind'>> : never
  : never;

export type PaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

/** A view placed on a sheet. Positions and sizes are paper millimetres from the sheet's top-left. */
export interface SheetViewport {
  id: string;
  viewId: string;
  /** Centre of the viewport on the paper. */
  x: number;
  y: number;
  /** Drawing scale denominator: 100 means 1:100. */
  scale: number;
  /** Crop box on the paper; the drawing is clipped to it. 0 × 0 means "fit the drawing". */
  width: number;
  height: number;
  /** Drawing point (metres) shown at the viewport centre; `null` centres the drawing. */
  center: { x: number; y: number } | null;
  /** Drafting layers this viewport hides, on top of its view's. */
  hiddenLayers?: string[];
  /** The drawing number printed in its title, chosen; absent: numbered 1, 2, 3 … in reading order (`drafting/cross-ref.ts`). */
  drawingNumber?: string;
}

export interface ProjectSheet {
  id: string;
  /** Sheet number as printed in the title block, e.g. "A-101". */
  number: string;
  /**
   * The number was chosen by the program, not typed: it is replaced by the
   * group's next number when the first view is placed. Cleared by then, and
   * by typing a number. Absent on sheets from older files, which are never
   * renumbered.
   */
  autoNumber?: boolean;
  name: string;
  createdAt: number;
  paper?: PaperSize;
  orientation?: 'landscape' | 'portrait';
  viewports?: SheetViewport[];
  /** Title block fields this sheet says otherwise than the project's (`ProjectDocument.titleBlock`); a key present wins, even empty. */
  titleBlock?: Record<string, string>;
}

/** The identity of a model a project refers to (content hash, else its name). */
export interface ProjectModelRef {
  key: string;
  name: string;
}

/** A joinery schedule (door / window list): a project document of its own, placeable on sheets. */
export interface ProjectSchedule {
  id: string;
  name: string;
  /** What it lists: doors and windows (joinery), the materials with their quantities (a takeoff), the quantities by element type, or the finishes of each room. */
  kind: 'door' | 'window' | 'all' | 'materials' | 'types' | 'finishes';
  createdAt: number;
  /** Scale of its drawings (50 = 1:50). */
  scale?: number;
}

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

export interface ProjectDocument {
  name: string;
  models: ProjectModelRef[];
  views: ProjectView[];
  sheets: ProjectSheet[];
  /** Title block fields every sheet prints (project, client, drawn by, date, revision, logo…), filled once (`title-block.ts`). */
  titleBlock?: Record<string, string>;
  /** Drafted geometry, each entity on one view (phase 4). */
  drafts: DraftEntity[];
  draftLayers: DraftLayer[];
  /** User-imported hatch patterns, as `.pat` text (built-ins are not stored). */
  hatchPatterns?: string;
  /** Drafting standards: text and dimension styles, and the groups layers are filed in. */
  textStyles?: TextStyle[];
  dimStyles?: DimStyle[];
  layerGroups?: LayerGroup[];
  /** Door and window opening symbols in elevation: apex at the handle (default, window makers' sketches) or at the hinges (DIN 1356). */
  openingLines?: 'handle' | 'hinge';
  /** Plan symbol overrides by element GlobalId: bit 1 hinges a door on its other jamb, bit 2 swings it to the other side. */
  symbolFlips?: Record<string, number>;
  /** The project's door and window types (the configurator's catalogue); each is one IFC type per model it is placed in. */
  joineryTypes?: JoinerySpec[];
  /** The catalogue entry the Door / Window tools place, per kind. */
  currentJoinery?: { door?: string; window?: string };
  /** Which catalogue entry draws the doors and windows a model does not type itself (`joinery/symbol-mapping.ts`). */
  joineryMapping?: JoineryMapping;
  /** The project's wall, slab, column, beam, roof and opening types; each is one IFC type per model it is used in. */
  elementTypes?: ElementTypeSpec[];
  /** The entry each Design tool builds with, per kind. */
  currentTypes?: Partial<Record<ElementTypeKind, string>>;
  schedules?: ProjectSchedule[];
  /** The project's structure profile library (retaining walls, tunnels, decks, barriers… and drawn shapes). */
  structureProfiles?: StructureProfile[];
  /** Road drawings: longitudinal profiles and cross-section sets. */
  civilDrawings?: ProjectCivilDrawing[];
  /** Typical road cross-sections (assemblies) corridors take from. */
  typicalSections?: ProjectTypicalSection[];
  /** Building materials: how each IfcMaterial draws where it is cut. */
  materials?: ProjectMaterial[];
  /** The CAD layer standard: which DXF layer (name, colour, pen, line type) an IFC class or material goes on (`cad-layers.ts`). */
  cadLayers?: CadLayerRule[];
  /** Named section cuts of the Drawing panel. */
  savedSectionCuts?: SavedSectionCut[];
  /** Named presets of the annotation tools. */
  annotationTypes?: AnnotationType[];
  /** The project's own symbols (the built-in ones are in code). */
  symbols?: DraftSymbol[];
  /** Legends: generated tables of what the drawings use, placeable on sheets. */
  legends?: ProjectLegend[];
  /** Which IFC property feeds each field of a tag, per tag kind (`tagfields/tag-fields.ts`); only what differs from the defaults. */
  tagFields?: TagFieldConfig;
  /** The sets of sheets that were issued, oldest first (`issue/plan.ts`). */
  issues?: ProjectIssue[];
  /** The model as the project last knew it: what a new version is compared with (`whatchanged/`). */
  modelState?: ModelSnapshot;
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
