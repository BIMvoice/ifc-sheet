/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TitleSource } from './title-block-sources';
import type { TitleBlockParam } from './title-block-params';
import type { TitleBlockTemplate } from './title-block-template';
import type { ModelSnapshot } from '@/whatchanged/snapshot';
import type { JoineryMapping } from '@/joinery/symbol-mapping';
import type { JoinerySpec, StructureProfile } from '@ifc-lite/create';
import type { ElementTypeKind, ElementTypeSpec } from '@/element-types/spec';
import type { DimStyle, LayerGroup, TextStyle } from '@/drafting/styles';
import type { AnnotationType, DraftSymbol, LibraryDetail, ProjectLegend } from '@/catalogue/types';
import type { TagFieldConfig } from '@/tagfields/tag-fields';
import type { CadLayerRule } from './cad-layers';
import type { DisciplineId } from './discipline-views';
import type { ThreeDProjectView } from './view-3d-types';
export type { AxonometricPreset, ThreeDProjection, ThreeDProjectView, ViewRaster } from './view-3d-types';

/**
 * The project document: the views and sheets a user organises over the
 * loaded models, Revit/ArchiCAD style. A view is a persistent project
 * object; opening one only points the live section / camera at it. The
 * whole document round-trips through the `.ifclite-project.json` sidecar
 * file kept next to the IFC files (`project-file.ts`).
 */

import type { SectionPlaneAxis } from '@/store/types';
import type { CustomSectionPlane } from '@/store/section-types';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectIssue } from '@/issue/types';
import type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, SavedSectionCut } from './project-records';

export type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, SavedSectionCut, SavedSectionCutPlane } from './project-records';

export type ProjectViewKind = 'plan' | 'section' | 'elevation' | '3d' | 'drafting';

/** The facade an elevation looks at (project north = IFC +Y). */
export type ElevationDirection = 'north' | 'south' | 'east' | 'west';

/** A building level, merged across federated models at the same elevation. */
export interface ProjectLevel {
  name: string;
  /** Floor elevation, metres: the storeys' IfcBuildingStorey.Elevation, what levels are matched and named by. */
  elevation: number;
  /** IfcBuildingStorey GlobalIds (one per model that has this level). */
  storeyGlobalIds: string[];
  /**
   * The floor in the drawing frame (render Y: the storey's placement-chain Z less the RTC offset and origin
   * shift the meshes were moved by), derived from the loaded models and never saved. Absent: `elevation`.
   * Read through `levelFloorY`.
   */
  floorY?: number;
}

export interface ProjectViewBase {
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
  /** The site plan: the ground storey's cut with the plot, setbacks and coordinates on it (`siteplan/`). */
  site?: true;
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

/**
 * A drawing with no model behind it: a scale, a name and the drafts drawn on
 * it (a typical parapet, a threshold). It generates no model geometry, is
 * placed on sheets like any view and can be the target of a detail mark.
 */
export interface DraftingProjectView extends ProjectViewBase {
  kind: 'drafting';
  /** The number a detail mark shows for it (1, 2, …), set when a mark is made; shared with the numbers of the project's details. */
  number?: number;
}

export type ProjectView = PlanProjectView | SectionProjectView | ElevationProjectView | ThreeDProjectView | DraftingProjectView;

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
  /** The page of a document split over several sheets (the drawing register's continuation sheets), from 0; absent is 0. */
  page?: number;
  /** A key plan: the viewport (on the same sheet) whose extent it outlines on the whole plan (`siteplan/key-plan.ts`). */
  keyPlanOf?: string;
  /** The drawing number printed in its title, chosen; absent: numbered 1, 2, 3 … in reading order (`drafting/cross-ref.ts`). */
  drawingNumber?: string;
}

/** The groups of sheets a numbering scheme numbers apart: `other` is details and whatever fits no series. */
export type NumberGroup = 'general' | 'plans' | 'elevations' | 'sections' | 'interiors' | 'details' | 'schedules' | 'other';

/** How one group's numbers are written: `<discipline><prefix><separator><n padded to digits>`, `n` running from `start` by `step`. */
export interface GroupPattern {
  prefix: string;
  separator: string;
  start: number;
  digits: number;
  step: number;
}

/** The project's sheet numbering (`numbering.ts`). */
export interface NumberingScheme {
  /** Printed first on every number: `A` for architecture. */
  discipline: string;
  /** One running sequence through the whole set (A01, A02, …) instead of one per group; the plans pattern then numbers every sheet. */
  continuous: boolean;
  groups: Record<NumberGroup, GroupPattern>;
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
  /** The number was typed by hand: a renumbering keeps it unless asked to renumber those too (`numbering.ts`). */
  numberOverride?: boolean;
  /** The number series the sheet belongs to, what it is renumbered by. Absent on older sheets, read back from the number (`numberGroupOf`). */
  series?: NumberGroup;
  name: string;
  createdAt: number;
  paper?: PaperSize;
  orientation?: 'landscape' | 'portrait';
  viewports?: SheetViewport[];
  /** Title block fields this sheet says otherwise than the project's (`ProjectDocument.titleBlock`); a key present wins, even empty. */
  titleBlock?: Record<string, string>;
  /** The values this sheet gives title block parameters otherwise than the project's (`title-block-params.ts`); a name present wins. */
  titleBlockParams?: Record<string, string>;
}

/** The identity of a model a project refers to (content hash, else its name). */
export interface ProjectModelRef {
  key: string;
  name: string;
  /** How views draw it (`model-styles.ts`): the host draws as itself, a linked model in its own style. Absent: the first model is the host. */
  role?: 'host' | 'linked';
  /** Absent: the host draws normally, a linked model in halftone. */
  drawStyle?: 'normal' | 'halftone';
}

/** A joinery schedule (door / window list): a project document of its own, placeable on sheets. */
export interface ProjectSchedule {
  id: string;
  name: string;
  /** What it lists: doors and windows (joinery), the materials with their quantities (a takeoff), the quantities by element type, the finishes of each room, or the set's own sheets (the drawing register, derived from the sheets on every draw). */
  kind: 'door' | 'window' | 'all' | 'materials' | 'types' | 'finishes' | 'register';
  createdAt: number;
  /** Scale of its drawings (50 = 1:50). */
  scale?: number;
}

export interface ProjectDocument {
  name: string;
  models: ProjectModelRef[];
  views: ProjectView[];
  sheets: ProjectSheet[];
  /** Title block fields every sheet prints (project, client, drawn by, date, revision, logo…), filled once (`title-block.ts`). */
  titleBlock?: Record<string, string>;
  /** Where each title block field reads its value in the model, by field id; a field not listed reads its default (`title-block-sources.ts`). */
  titleBlockSources?: Record<string, TitleSource[]>;
  /** The user's own title block parameters, in order, each with its project-wide value (`title-block-params.ts`). */
  titleBlockParams?: TitleBlockParam[];
  /** The title block's layout once edited; absent: the standard layout (`title-block-template.ts`). */
  titleBlockTemplate?: TitleBlockTemplate;
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
  /** Details drawn once and kept for reuse: drafting views saved to the library, placed again with `placeLibraryDetail`. */
  details?: LibraryDetail[];
  /** Legends: generated tables of what the drawings use, placeable on sheets. */
  legends?: ProjectLegend[];
  /** Which IFC property feeds each field of a tag, per tag kind (`tagfields/tag-fields.ts`); only what differs from the defaults. */
  tagFields?: TagFieldConfig;
  /** The sets of sheets that were issued, oldest first (`issue/plan.ts`). */
  issues?: ProjectIssue[];
  /** How sheets are numbered (`numbering.ts`); absent is the default A-101 style. Document key: `sheetNumbering`. */
  sheetNumbering?: NumberingScheme;
  /** The model as the project last knew it: what a new version is compared with (`whatchanged/`). */
  modelState?: ModelSnapshot;
}

// The issue records live with the issue code; re-exported so the document's types stay in one import.
export type { IssuedSheet, ProjectIssue } from '@/issue/types';
