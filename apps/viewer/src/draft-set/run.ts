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
import { applyDraftSet, type ApplyReport } from './apply';
import { planDraftSet } from './plan';
import { appSheetSpec } from './sheet-spec';
import type { DraftSetPlan, Reason } from './types';

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

/** Plan and apply the draft set for the loaded model; one Undo removes what it added. */
export function makeDraftSet(today: Date = new Date()): DraftSetOutcome {
  const viewer = useViewerStore.getState();
  const bounds = mergedSectionBounds(viewer.models, viewer.geometryResult);
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
  if (!bounds || plan.views.length === 0) return { plan, report: null, lines };
  const report = applyDraftSet(plan, { levels: project.levels, bounds, text: sayReason });
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
