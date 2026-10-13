/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DRAFTSET: make the drawing set whole for the loaded model (the one planner the
 * Wall starts from, `ensureDrawingSet`) and say what
 * was done, sheet by sheet with the reason for its scale.
 */

import type { TranslationKey } from '@/i18n';
import { resolve } from '@/i18n/registry';
import { useViewerStore } from '@/store';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useProjectStore } from '@/project/project-store';
import { sheetGroup, sheetScaleReason, type Reason } from '@/project/drawing-set';
import { ensureDrawingSet, type EnsureReport } from '@/project/drawing-set-actions';
import { modelMeshes, setExtent } from './body';

export const DRAFTSET_NAMES = ['DRAFTSET', 'DRAFT-SET'];

export interface SummaryLine {
  key: TranslationKey;
  params: Record<string, string | number>;
}

export interface DraftSetOutcome {
  report: EnsureReport | null;
  lines: SummaryLine[];
}

/** A sentence kept as data, in words. */
export function sayReason(reason: Reason): string {
  const params = { ...reason.params };
  if (typeof params.kind === 'string') params.kind = resolve(`draftSet.kind.${params.kind}` as TranslationKey);
  return resolve(reason.key, params);
}

const line = (text: string): SummaryLine => ({ key: 'draftSet.msg.line', params: { text } });

/** Make the set whole for the loaded model (one undo step) and describe it. */
export function makeDraftSet(): DraftSetOutcome {
  const viewer = useViewerStore.getState();
  const whole = mergedSectionBounds(viewer.models, viewer.geometryResult);
  const meshes = modelMeshes();
  const { extent, leftOut } = setExtent(useProjectStore.getState().levels, meshes, whole);
  if (!extent) return { report: null, lines: [line(sayReason({ key: 'draftSet.note.noModel', params: {} }))] };
  const report = ensureDrawingSet(meshes, extent);
  const { sheets, views } = useProjectStore.getState();
  const sheetLines = sheets.filter((s) => ['plans', 'elevations', 'sections'].includes(sheetGroup(s) ?? '')).flatMap((s) => {
    const why = sheetScaleReason(s, views, extent);
    return why ? [line(`${s.number} ${s.name}: ${sayReason(why.reason)}`)] : [];
  });
  const notes = report.notes.map((n) => line(sayReason(n)));
  if (leftOut > 0) notes.push(line(sayReason({ key: 'draftSet.note.leftOut', params: { count: leftOut } })));
  return {
    report,
    lines: [
      {
        key: 'draftSet.msg.summary',
        params: { newViews: report.viewsAdded, newSheets: report.sheetsAdded, oldViews: report.viewsExisting, oldSheets: report.sheetsExisting },
      },
      ...sheetLines,
      ...notes,
    ],
  };
}
