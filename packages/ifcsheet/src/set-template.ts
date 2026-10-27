/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A set template (#21): how one project's drawing set is made, kept as rules a
 * different building can be given. A template never names a view; it names the
 * rule that finds one in the model it is applied to:
 *
 *   - a plan by its storey counted from the ground storey (`groundPlan`: 0 is
 *     the storey entered from the ground, +1 the one above, -1 a basement),
 *   - an elevation by its direction,
 *   - a section by its place among the sections the set draws (the automatic
 *     set draws the proposed ones, `SET_SECTIONS`).
 *
 * Each sheet rule carries the sheet (name, series, paper, orientation, frame)
 * and its slots in order, each slot a view rule and the scale it is drawn at.
 * The automatic set is the template's default: a view no rule foresaw is laid
 * out by the same rows the automatic set uses (`setRows`), on the paper and at
 * the scale of the last sheet its series has in the template (`set-template-apply.ts`).
 *
 * This file holds the rule model and takes a template out of a project; the
 * `.bvset` file is in `set-template-file.ts`.
 */

import { groundPlan, sheetGroup } from './drawing-set.js';
import type { ElevationDirection, NumberingScheme, Paper, PaperSize, PlanProjectView, ProjectSheet, ProjectView, SheetFrame } from './document.js';
import type { ScheduleListKind } from './sub-reports.js';
import { sameElevation } from './view-defaults.js';

/** The series whose sheets are made by view rules; a room's interior elevations and the schedules are not (see `ScheduleRule`). */
export type RuledSeries = 'plans' | 'elevations' | 'sections';
export const RULED_SERIES: readonly RuledSeries[] = ['plans', 'elevations', 'sections'];

/** What finds a view in the model the template is applied to. */
export type ViewRule =
  | { kind: 'plan'; storey: number }
  /** A plan of EVERY storey the model has (`allPlans`), from the lowest up: a slot per storey the model offers, none to count in advance. */
  | { kind: 'allPlans' }
  /** The project's site plan (a plan with `site`); the set makes one on the ground storey when a template asks for it (`default-set.ts`). */
  | { kind: 'site' }
  | { kind: 'elevation'; direction: ElevationDirection }
  | { kind: 'section'; place: number };

/** A place on a sheet, in reading order: the view rule that fills it and the scale it is drawn at (50 = 1:50). */
export interface SlotRule {
  view: ViewRule;
  scale?: number;
  /**
   * The north arrow and the graphic scale bar the viewport takes (`SheetViewport.northArrow` / `scaleBar`, drawn by
   * `viewport-marks.ts`). Absent follows the view, as for any viewport: on for a site plan, off otherwise.
   */
  northArrow?: boolean;
  scaleBar?: boolean;
}

/** The paper a sheet is made on. `templateId` is kept only for a built-in sheet template, which every project has. */
export interface SheetLayoutRule {
  paper: Paper;
  orientation: 'landscape' | 'portrait';
  frame?: SheetFrame;
  templateId?: string;
  /**
   * Larger papers, in the order to try them, for a sheet whose drawings do not fit `paper` at the scale its slots ask
   * for. The sheet takes the first one the drawings fit at that scale and keeps the scale; only the paper changes. When
   * none fits, the largest is used and the scale falls back as for any sheet (a `rescaled` note).
   */
  stepUp?: PaperSize[];
}

export interface SheetRule {
  name: string;
  series: RuledSeries;
  layout: SheetLayoutRule;
  slots: SlotRule[];
  /** Lines the sheet prints on itself (`ProjectSheet.notes`), fixed text in the language of whoever laid the set out; they come before the paper and scale notes. */
  notes?: string[];
}

/** A schedule the set carries, by kind, on a sheet of the schedules series. */
export interface ScheduleRule {
  kind: ScheduleListKind;
  name: string;
  scale?: number;
  sheet: { name: string; layout: SheetLayoutRule };
}

/** The annotation commands a series' views had been given when the template was saved. */
export type AnnotationCommand = 'tagAll' | 'dimAll' | 'levelAll';
export const ANNOTATION_COMMANDS: readonly AnnotationCommand[] = ['tagAll', 'dimAll', 'levelAll'];
export type Annotations = Partial<Record<RuledSeries, AnnotationCommand[]>>;

export interface SetTemplate {
  name: string;
  sheets: SheetRule[];
  schedules: ScheduleRule[];
  annotations: Annotations;
  /** The project's sheet numbering; absent: the one the project already has. */
  numbering?: NumberingScheme;
  /**
   * Settings the app validates and applies and the engine only carries (a title block layout and its parameters, which
   * IFC property feeds each tag field): JSON as saved, unread here, so a file round-trips them unchanged.
   */
  carried?: Record<string, unknown>;
}

/** The views a set draws a rule can find: plans (not details, not the site plan), the facade elevations and the sections. */
export function ruledViews(views: readonly ProjectView[]): ProjectView[] {
  return views.filter((v) => !v.detail && (v.kind === 'plan' ? !v.site : v.kind === 'elevation' ? !v.interior : v.kind === 'section'));
}

/** The set's plans from the lowest storey up, and the index of the ground storey among them (-1 when there is no plan). */
export function planStoreys(views: readonly ProjectView[]): { plans: PlanProjectView[]; ground: number } {
  const ruled = ruledViews(views);
  const plans = ruled.filter((v): v is PlanProjectView => v.kind === 'plan').sort((a, b) => a.level.elevation - b.level.elevation);
  const ground = groundPlan(ruled);
  return { plans, ground: ground ? plans.indexOf(ground) : -1 };
}

/**
 * The floor plans of the building, one per storey, from the lowest up: no site plan, detail, discipline plan or reflected
 * ceiling plan, and when a storey has several the first. A storey is a level (`sameElevation`), which federated models share.
 */
export function allPlans(views: readonly ProjectView[]): PlanProjectView[] {
  const plans = ruledViews(views).filter((v): v is PlanProjectView => v.kind === 'plan' && !v.discipline && !v.reflected).sort((a, b) => a.level.elevation - b.level.elevation);
  return plans.filter((plan, i) => plans.findIndex((p) => sameElevation(p.level.elevation, plan.level.elevation)) === i);
}

/** Every view `rule` finds among `views` (one for a rule that names one storey, direction or section; none when there is no such view). */
export function findAllByRule(rule: ViewRule, views: readonly ProjectView[]): ProjectView[] {
  if (rule.kind === 'allPlans') return allPlans(views);
  const one = findByRule(rule, views);
  return one ? [one] : [];
}

/** The view `rule` finds among `views`; null when the model has none (no third storey, a second section it does not offer). */
export function findByRule(rule: ViewRule, views: readonly ProjectView[]): ProjectView | null {
  const ruled = ruledViews(views);
  if (rule.kind === 'allPlans') return allPlans(views)[0] ?? null;
  if (rule.kind === 'site') return views.find((v) => v.kind === 'plan' && v.site && !v.detail) ?? null;
  if (rule.kind === 'plan') {
    const { plans, ground } = planStoreys(views);
    return ground < 0 ? null : plans[ground + rule.storey] ?? null;
  }
  if (rule.kind === 'elevation') return ruled.find((v) => v.kind === 'elevation' && v.direction === rule.direction) ?? null;
  return ruled.filter((v) => v.kind === 'section')[rule.place] ?? null;
}

/** The rule that finds `view` again in `views`; null for a view no rule can name (3D, a drafting view, a detail, an interior elevation, the site plan). */
export function ruleOf(view: ProjectView, views: readonly ProjectView[]): ViewRule | null {
  if (!ruledViews(views).includes(view)) return null;
  if (view.kind === 'plan') {
    const { plans, ground } = planStoreys(views);
    const at = plans.indexOf(view);
    return ground < 0 || at < 0 ? null : { kind: 'plan', storey: at - ground };
  }
  if (view.kind === 'elevation') return { kind: 'elevation', direction: view.direction };
  if (view.kind === 'section') return { kind: 'section', place: ruledViews(views).filter((v) => v.kind === 'section').indexOf(view) };
  return null;
}

/** A sheet's paper as a layout rule. A project sheet template is not carried by id (the other project may not have it): its paper and frame are. */
export function layoutOf(sheet: Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId'>): SheetLayoutRule {
  return {
    paper: sheet.paper ?? 'A1',
    orientation: sheet.orientation ?? 'landscape',
    ...(sheet.frame ? { frame: sheet.frame } : {}),
    ...(sheet.templateId?.startsWith('builtin:') ? { templateId: sheet.templateId } : {}),
  };
}

export interface CaptureInput {
  name: string;
  views: readonly ProjectView[];
  sheets: readonly ProjectSheet[];
  /** The commands run on each view (`viewId` to commands): known to the app, which holds the drafts. */
  annotated?: ReadonlyMap<string, readonly AnnotationCommand[]>;
  schedules?: readonly ScheduleRule[];
  numbering?: NumberingScheme;
  carried?: Record<string, unknown>;
}

/**
 * The template that makes `sheets` again: one sheet rule per sheet of the plans, elevations and sections series, in sheet
 * order, each viewport a slot when a rule can name its view. A series is said to be annotated when every one of its views
 * that sits on a sheet has the command.
 */
export function captureSetTemplate(input: CaptureInput): SetTemplate {
  const { views, sheets } = input;
  const sheetRules: SheetRule[] = [];
  const hung = new Map<RuledSeries, ProjectView[]>();
  for (const sheet of sheets) {
    const series = sheetGroup(sheet);
    if (series !== 'plans' && series !== 'elevations' && series !== 'sections') continue;
    const slots: SlotRule[] = [];
    for (const vp of sheet.viewports ?? []) {
      const view = views.find((v) => v.id === vp.viewId);
      const rule = view ? ruleOf(view, views) : null;
      if (!view || !rule) continue;
      slots.push({ view: rule, scale: vp.scale, ...(vp.northArrow === undefined ? {} : { northArrow: vp.northArrow }), ...(vp.scaleBar === undefined ? {} : { scaleBar: vp.scaleBar }) });
      hung.set(series, [...(hung.get(series) ?? []), view]);
    }
    if (slots.length > 0) sheetRules.push({ name: sheet.name, series, layout: layoutOf(sheet), slots });
  }
  const annotations: Annotations = {};
  for (const series of RULED_SERIES) {
    const members = hung.get(series) ?? [];
    const common = ANNOTATION_COMMANDS.filter((c) => members.length > 0 && members.every((v) => input.annotated?.get(v.id)?.includes(c)));
    if (common.length > 0) annotations[series] = common;
  }
  return {
    name: input.name,
    sheets: sheetRules,
    schedules: [...(input.schedules ?? [])],
    annotations,
    ...(input.numbering ? { numbering: input.numbering } : {}),
    ...(input.carried && Object.keys(input.carried).length > 0 ? { carried: input.carried } : {}),
  };
}
