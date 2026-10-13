/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall does to the project: lay out the starting set when a model
 * opens on an empty project, change the scale of a group of sheets, swap the
 * view in a sheet's slot for another proposed section. Each is one store
 * write over `drawing-set.ts`'s pure layout.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { createProposedSection } from '@/drafting/section-create';
import type { AxisBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { buildDrawingSet, drawingArea, nextInSeries, rowOfViewports, SET_PAPER, sheetGroup, viewExtent, withViewHung, type ModelExtent, type SetGroup } from './drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { freshProjectId } from './view-defaults';
import { proposalInputForLevel } from './model-rooms';
import { useProjectStore } from './project-store';
import { proposeSections, type SectionProposal } from './section-proposals';
import type { PlanProjectView, ProjectSchedule, ProjectSheet, ProjectView, SectionProjectView } from './types';

/** How many proposed sections the starting set draws; the rest wait in the tray. */
export const SET_SECTIONS = 2;

/** Title block fields the model can fill: the project's name and today's date. */
export function modelTitleBlock(now = new Date()): Record<string, string> {
  const fields: Record<string, string> = { date: now.toISOString().slice(0, 10) };
  for (const model of useViewerStore.getState().models.values()) {
    const project = model.ifcDataStore?.spatialHierarchy?.project;
    const name = project?.longName || project?.name;
    if (name) {
      fields.project = name;
      break;
    }
  }
  return fields;
}

/** The lowest plan: the one a set's sections are drawn on. */
export function groundPlan(views: readonly ProjectView[]): PlanProjectView | null {
  const plans = views.filter((v): v is PlanProjectView => v.kind === 'plan');
  return plans.sort((a, b) => a.level.elevation - b.level.elevation)[0] ?? null;
}

/** The sections the model suggests, cut on its lowest plan. Empty until the geometry is there. */
export function sectionProposals(meshes: MeshData[] | null, bounds: AxisBounds | null): SectionProposal[] {
  const plan = groundPlan(useProjectStore.getState().views);
  const input = plan ? proposalInputForLevel(plan.level, meshes, bounds) : null;
  return input ? proposeSections(input) : [];
}

/** The section already made for `proposal`, else a new one on the lowest plan. */
export function sectionForProposal(proposal: SectionProposal): string | null {
  const { views, levels } = useProjectStore.getState();
  const existing = views.find((v): v is SectionProjectView => v.kind === 'section' && v.through === proposal.label);
  if (existing) return existing.id;
  const plan = groundPlan(views);
  return plan ? createProposedSection(plan, levels, proposal) : null;
}

/**
 * Lay out the starting set on a project that has no sheets yet: the first
 * proposed sections are made, then every view is put on a sheet. Returns
 * whether it did; a project with sheets is never touched.
 */
export function startDrawingSet(meshes: MeshData[] | null, bounds: AxisBounds | null): boolean {
  if (!bounds || useProjectStore.getState().sheets.length > 0) return false;
  if (!useProjectStore.getState().views.some((v) => v.kind === 'section')) {
    for (const proposal of sectionProposals(meshes, bounds).slice(0, SET_SECTIONS)) sectionForProposal(proposal);
  }
  const { views } = useProjectStore.getState();
  const sheets = buildDrawingSet({ views, extent: bounds, titleBlock: modelTitleBlock() });
  if (sheets.length === 0) return false;
  useProjectStore.setState({ sheets, dirty: true });
  return true;
}

/** Lay every sheet of `group` out again at `scale`. */
export function setGroupScale(group: SetGroup, scale: number, extent: ModelExtent): void {
  const { sheets, views } = useProjectStore.getState();
  useProjectStore.setState({
    sheets: sheets.map((sheet) => {
      if (sheetGroup(sheet) !== group) return sheet;
      const members = (sheet.viewports ?? []).flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []);
      const sizes = members.map((v) => viewExtent(v, extent));
      return { ...sheet, viewports: rowOfViewports(members, sizes, scale, sheet.paper) };
    }),
    dirty: true,
  });
}

/** The scale the sheets of `group` are drawn at, when they all share one. */
export function groupScale(group: SetGroup, sheets: readonly ProjectSheet[] = useProjectStore.getState().sheets): number | null {
  const scales = new Set(sheets.filter((s) => sheetGroup(s) === group).flatMap((s) => (s.viewports ?? []).map((v) => v.scale)));
  return scales.size === 1 ? [...scales][0] : null;
}

/** Show `viewId` in the slot of `viewportId`, keeping the slot's place and scale. */
export function swapViewportView(sheetId: string, viewportId: string, viewId: string): void {
  const { sheets } = useProjectStore.getState();
  useProjectStore.setState({
    sheets: sheets.map((s) => (s.id !== sheetId ? s : { ...s, viewports: (s.viewports ?? []).map((v) => (v.id === viewportId ? { ...v, viewId, width: 0, height: 0, center: null } : v)) })),
    dirty: true,
  });
}

/** Hang `viewId` on the set (`withViewHung`); returns the sheet it went on, or null when it already hangs or cannot. */
export function hangView(viewId: string, extent: ModelExtent): string | null {
  const { sheets, views } = useProjectStore.getState();
  const view = views.find((v) => v.id === viewId);
  const hung = view ? withViewHung(sheets, views, view, extent, sheets[0]?.titleBlock ?? modelTitleBlock()) : null;
  if (!hung) return null;
  useProjectStore.setState({ sheets: hung.sheets, dirty: true });
  return hung.sheetId;
}

/**
 * Hang a schedule (doors and windows, or the material takeoff) on a sheet of
 * its own in the A-6xx series, its table centred in the drawing area, named
 * after it. Returns the sheet's id; a schedule already on a sheet returns
 * that sheet.
 */
export function hangSchedule(scheduleId: string): string | null {
  const { sheets, schedules } = useProjectStore.getState();
  const schedule = schedules?.find((s) => s.id === scheduleId);
  if (!schedule) return null;
  const placed = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === scheduleId));
  if (placed) return placed.id;
  const area = drawingArea(SET_PAPER);
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: nextInSeries(sheets, 'schedules'), name: schedule.name, createdAt: Date.now(), paper: SET_PAPER, orientation: 'landscape',
    titleBlock: { ...(sheets[0]?.titleBlock ?? modelTitleBlock()) },
    viewports: [{ id: freshProjectId('viewport'), viewId: scheduleId, x: area.x + area.w / 2, y: area.y + area.h / 2, scale: 50, width: 0, height: 0, center: null }],
  };
  useProjectStore.setState({ sheets: [...sheets, sheet], dirty: true });
  return sheet.id;
}

/** A new schedule hung on the set (`hangSchedule`); returns its sheet. */
export function addScheduleToSet(kind: ProjectSchedule['kind'], name: string): string {
  const id = hangSchedule(addSchedule(kind, name));
  if (!id) throw new Error('a schedule just added was not found');
  return id;
}
