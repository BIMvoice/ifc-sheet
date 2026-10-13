/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DRAFTSET: read the loaded model, plan the draft set, apply it, and say what
 * was done. The one place the planner and the applier meet the app's stores.
 */

import type { TranslationKey } from '@/i18n';
import { resolve } from '@/i18n/registry';
import { useViewerStore } from '@/store';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { collectSpatialContainerNames } from '@/utils/spatialHierarchy';
import { useProjectStore } from '@/project/project-store';
import type { MeshData } from '@ifc-lite/geometry';
import { applyDraftSet, type ApplyReport } from './apply';
import { mainBodyBounds } from './extents';
import { planDraftSet } from './plan';
import { appSheetSpec } from './sheet-spec';
import type { Box3, DraftSetPlan, Reason } from './types';

export const DRAFTSET_NAMES = ['DRAFTSET', 'DRAFT-SET'];

export interface SummaryLine {
  key: TranslationKey;
  params: Record<string, string | number>;
}

export interface DraftSetOutcome {
  plan: DraftSetPlan;
  report: ApplyReport | null;
  lines: SummaryLine[];
}

/** A sentence kept as data, in the person's language. */
export function sayReason(reason: Reason): string {
  const params = { ...reason.params };
  if (typeof params.kind === 'string') params.kind = resolve(`draftSet.kind.${params.kind}` as TranslationKey);
  return resolve(reason.key, params);
}

const line = (text: string): SummaryLine => ({ key: 'draftSet.msg.line', params: { text } });

function modelNames(): { project: string; building: string } {
  const { models, ifcDataStore } = useViewerStore.getState();
  const stores = models.size > 0 ? Array.from(models.values(), (m) => m.ifcDataStore) : [ifcDataStore];
  for (const store of stores) {
    if (!store?.spatialHierarchy) continue;
    const names = collectSpatialContainerNames(store.spatialHierarchy, (id) => store.entities.getName(id) || '');
    return { project: names.projects[0] ?? '', building: names.buildings[0] ?? '' };
  }
  return { project: '', building: '' };
}

/** An element's box in the viewer frame, metres: its local box carried through its placement. */
function worldBox(mesh: MeshData): Box3 | null {
  const lb = mesh.localBounds;
  const m = mesh.localToWorld;
  if (!lb || !m || m.length < 16) return null;
  const out: Box3 = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? lb.max[0] : lb.min[0], i & 2 ? lb.max[1] : lb.min[1], i & 4 ? lb.max[2] : lb.min[2]];
    const w = [0, 1, 2].map((r) => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]);
    out.min = { x: Math.min(out.min.x, w[0]), y: Math.min(out.min.y, w[1]), z: Math.min(out.min.z, w[2]) };
    out.max = { x: Math.max(out.max.x, w[0]), y: Math.max(out.max.y, w[1]), z: Math.max(out.max.z, w[2]) };
  }
  return Number.isFinite(out.min.x + out.max.x + out.min.y + out.max.y + out.min.z + out.max.z) ? out : null;
}

/** The extents to size the set to: the main body of the model's elements, else the model's whole box. */
function draftExtents(whole: Box3 | null): { bounds: Box3 | null; leftOut: number } {
  const viewer = useViewerStore.getState();
  const meshes = viewer.models.size > 0 ? Array.from(viewer.models.values()).flatMap((m) => m.geometryResult?.meshes ?? []) : (viewer.geometryResult?.meshes ?? []);
  const boxes = meshes.map(worldBox).filter((b): b is Box3 => b !== null);
  const body = mainBodyBounds(boxes);
  // A body outside the whole box means the placements are not in the frame the bounds are: trust the bounds.
  const inside = body && whole && body.bounds.min.x >= whole.min.x - 1 && body.bounds.max.x <= whole.max.x + 1 && body.bounds.min.z >= whole.min.z - 1 && body.bounds.max.z <= whole.max.z + 1;
  return inside ? body : { bounds: whole, leftOut: 0 };
}

/** Plan and apply the draft set for the loaded model; one Undo removes what it added. */
export function makeDraftSet(today: Date = new Date()): DraftSetOutcome {
  const viewer = useViewerStore.getState();
  const whole = mergedSectionBounds(viewer.models, viewer.geometryResult);
  const { bounds, leftOut } = draftExtents(whole);
  const project = useProjectStore.getState();
  const names = modelNames();
  const plan = planDraftSet({
    projectName: names.project || project.name,
    buildingName: names.building,
    date: today.toISOString().slice(0, 10),
    storeys: project.levels.map((l) => ({ name: l.name, elevation: l.elevation })),
    bounds,
    spec: appSheetSpec(),
  });
  const lines: SummaryLine[] = plan.notes.map((n) => line(sayReason(n)));
  if (leftOut > 0) lines.push(line(sayReason({ key: 'draftSet.note.leftOut', params: { count: leftOut } })));
  if (!bounds || plan.views.length === 0) return { plan, report: null, lines };
  const report = applyDraftSet(plan, { levels: project.levels, bounds: whole ?? bounds, text: sayReason });
  return {
    plan,
    report,
    lines: [
      {
        key: 'draftSet.msg.summary',
        params: { views: plan.views.length, sheets: plan.sheets.length, newViews: report.viewsAdded, newSheets: report.sheetsAdded, oldViews: report.viewsExisting, oldSheets: report.sheetsExisting },
      },
      ...plan.sheets.map((s) => line(`${s.number} ${sayReason(s.title)}: ${sayReason(s.reason)}`)),
      ...lines,
    ],
  };
}
