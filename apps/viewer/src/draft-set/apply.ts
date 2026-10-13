/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The applier: turns a `DraftSetPlan` into project state through the same
 * functions the person's own commands use (a section by its line with its
 * mark on the plan, a view, a sheet, a viewport), so everything it makes is
 * an ordinary view or sheet to correct afterwards. It runs as ONE undo step.
 *
 * Running it again adds only what is missing. A planned view is "already
 * there" when the project holds one that means the same (a plan of that
 * level, the elevation of that facade, a section on the same plane); a
 * planned sheet is "already there" when every view it would carry is on some
 * sheet already. Names and numbers the person changed do not matter.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { addSectionFromLine, addSectionSymbol, sectionPlaneFromLine } from '@/drafting/commands/workplane';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { AxisBounds } from '@/lib/section/section-distance';
import { addProjectSheet, addProjectView, setSheetNumber, updateProjectView, useProjectStore } from '@/project/project-store';
import { addViewport, setTitleBlockField, updateSheet } from '@/project/sheets';
import { sameElevation } from '@/project/view-defaults';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { ProjectLevel, ProjectView } from '@/project/types';
import type { DraftSetPlan, PlannedSection, PlannedSheet, Reason } from './types';

export interface ApplyOptions {
  /** The project's levels and the model's bounds, as the work planes of the plans need them. */
  levels: readonly ProjectLevel[];
  bounds: AxisBounds;
  /** Turns a sentence kept as data into text (sheet titles are stored as text). */
  text: (reason: Reason) => string;
  styles?: { textStyle: string; dimStyle: string };
}

export interface ApplyReport {
  viewsAdded: number;
  viewsExisting: number;
  sheetsAdded: number;
  sheetsExisting: number;
  /** Numbers of the sheets added. */
  addedSheetNumbers: string[];
}

const SAME = 1e-4;

/** Whether a view is the section the line a-b looking toward `side` would make: the same plane, however it is named. */
function sameSectionPlane(view: ProjectView, line: PlannedSection['line'], plan: SectionPlaneConfig): boolean {
  if (view.kind !== 'section' || !view.plane.custom) return false;
  const expected = sectionPlaneFromLine(plan, line.a, line.b, line.side);
  const c = view.plane.custom;
  return !!expected && Math.abs(c.distance - expected.distance) < SAME && c.normal.every((n, i) => Math.abs(n - expected.normal[i]) < SAME);
}

/** Add the plan, elevation or section a planned view means, unless the project already has it. */
export function applyDraftSet(plan: DraftSetPlan, options: ApplyOptions): ApplyReport {
  const report: ApplyReport = { viewsAdded: 0, viewsExisting: 0, sheetsAdded: 0, sheetsExisting: 0, addedSheetNumbers: [] };
  const styles = options.styles ?? { textStyle: 'standard', dimStyle: 'standard' };
  const ids = new Map<string, string>();
  const views = () => useProjectStore.getState().views;

  runAsOneUndoStep(() => {
    // Plans and elevations first, so a section finds its plan.
    for (const planned of plan.views) {
      if (planned.kind === 'plan') {
        const found = views().find((v) => v.kind === 'plan' && sameElevation(v.level.elevation, planned.level.elevation));
        if (found) {
          ids.set(planned.key, found.id);
          report.viewsExisting++;
        } else {
          const level = options.levels.find((l) => sameElevation(l.elevation, planned.level.elevation));
          ids.set(planned.key, addProjectView({
            kind: 'plan', name: planned.name, cutHeight: planned.cutHeight,
            level: { name: planned.level.name, elevation: planned.level.elevation, storeyGlobalIds: [...(level?.storeyGlobalIds ?? [])] },
          }));
          report.viewsAdded++;
        }
        const id = ids.get(planned.key) as string;
        // Annotation sizes follow the scale the plan is drawn at, unless the person already drew on it.
        const state = useProjectStore.getState();
        const view = state.views.find((v) => v.id === id);
        if (view && view.scale === undefined && !state.drafts.some((d) => d.viewId === id)) updateProjectView(id, { scale: planned.scale });
      } else if (planned.kind === 'elevation') {
        const found = views().find((v) => v.kind === 'elevation' && v.direction === planned.direction);
        if (found) {
          ids.set(planned.key, found.id);
          report.viewsExisting++;
          // The person's own depth stays.
          if (found.viewDepth === undefined || found.viewDepth === null) updateProjectView(found.id, { viewDepth: planned.depth });
        } else {
          ids.set(planned.key, addProjectView({ kind: 'elevation', name: planned.name, direction: planned.direction, viewDepth: planned.depth }));
          report.viewsAdded++;
        }
      }
    }
    for (const planned of plan.views) {
      if (planned.kind !== 'section') continue;
      const planId = ids.get(planned.onPlan);
      const planView = planId ? views().find((v) => v.id === planId) : undefined;
      const plane = planView ? viewPlaneConfig(planView, options.levels, options.bounds) : null;
      if (!planId || !plane) continue;
      const layerId = useProjectStore.getState().draftLayers.find((l) => l.visible && !l.locked)?.id ?? '0';
      const symbol = { layerId, textHeight: 0.25 * (useProjectStore.getState().views.find((v) => v.id === planId)?.scale ?? 100) / 100, current: styles };
      const { a, b, side } = planned.line;
      const found = views().find((v) => sameSectionPlane(v, planned.line, plane));
      if (found) {
        ids.set(planned.key, found.id);
        report.viewsExisting++;
        if (found.viewDepth === undefined || found.viewDepth === null) updateProjectView(found.id, { viewDepth: planned.depth });
        // A section whose mark was deleted from the plan gets it back.
        if (!useProjectStore.getState().drafts.some((d) => d.params.sectionOf === found.id)) addSectionSymbol(planId, found.id, a, b, side, symbol);
        continue;
      }
      const id = addSectionFromLine(plane, planId, a, b, side, symbol);
      if (!id) continue;
      updateProjectView(id, { viewDepth: planned.depth });
      ids.set(planned.key, id);
      report.viewsAdded++;
    }

    for (const planned of plan.sheets) addSheet(planned, ids, options, report);
  });
  return report;
}

function addSheet(planned: PlannedSheet, ids: ReadonlyMap<string, string>, options: ApplyOptions, report: ApplyReport): void {
  const onSheets = new Set(useProjectStore.getState().sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId)));
  const missing = planned.viewports.filter((vp) => {
    const id = ids.get(vp.viewKey);
    return id !== undefined && !onSheets.has(id);
  });
  if (missing.length === 0) {
    report.sheetsExisting++;
    return;
  }
  const names = missing.map((vp) => useProjectStore.getState().views.find((v) => v.id === ids.get(vp.viewKey))?.name ?? '').join(' / ');
  // The number is chosen before the sheet exists, so the new sheet does not take its own number.
  const number = freeNumber(planned.number);
  const sheetId = addProjectSheet(options.text({ ...planned.title, params: { ...planned.title.params, names } }));
  setSheetNumber(sheetId, number);
  updateSheet(sheetId, { paper: planned.paper, orientation: planned.orientation });
  for (const [key, value] of Object.entries(planned.titleBlock)) setTitleBlockField(sheetId, key, value);
  for (const vp of missing) addViewport(sheetId, ids.get(vp.viewKey) as string, { x: vp.x, y: vp.y }, vp.scale);
  report.sheetsAdded++;
  report.addedSheetNumbers.push(number);
}

/** `planned` if no sheet has it, else the next free number in the same hundred series. */
function freeNumber(planned: string): string {
  const taken = new Set(useProjectStore.getState().sheets.map((s) => s.number));
  const m = /^(.*?)(\d+)$/.exec(planned);
  if (!m) return planned;
  for (let n = Number(m[2]); ; n++) if (!taken.has(`${m[1]}${n}`)) return `${m[1]}${n}`;
}
