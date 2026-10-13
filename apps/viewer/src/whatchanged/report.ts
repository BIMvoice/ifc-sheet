/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The changes sheet by sheet: for each sheet, the changed elements its views
 * show and the annotations on those views that lost or changed their element.
 * "A-101: 3 changes" counts elements, once each, however many views show them.
 * A sheet with nothing says so. Pure.
 */

import type { ProjectSheet } from '@/project/types';
import type { AnnotationImpact } from './impact';
import type { ModelChange } from './compare';
import { changesInView, type ViewBand } from './visibility';

export interface ViewChanges { viewId: string; changes: ModelChange[] }

export interface SheetChanges {
  sheetId: string;
  number: string;
  name: string;
  /** Per view on the sheet that shows something that changed. */
  views: ViewChanges[];
  /** The annotations on the sheet's views that lost or changed their element. */
  annotations: AnnotationImpact[];
  /** Distinct changed elements the sheet shows or annotates. */
  count: number;
}

export function sheetChanges(sheets: readonly ProjectSheet[], bands: readonly ViewBand[], changes: readonly ModelChange[], impacts: readonly AnnotationImpact[]): SheetChanges[] {
  const inView = new Map(bands.map((b) => [b.viewId, changesInView(changes, b)] as const));
  return sheets.map((s): SheetChanges => {
    const viewIds = [...new Set((s.viewports ?? []).map((v) => v.viewId))];
    const views = viewIds.flatMap((viewId): ViewChanges[] => { const c = inView.get(viewId) ?? []; return c.length ? [{ viewId, changes: c }] : []; });
    const annotations = impacts.filter((i) => viewIds.includes(i.viewId));
    const guids = new Set([...views.flatMap((v) => v.changes.map((c) => c.guid)), ...annotations.map((a) => a.guid)]);
    return { sheetId: s.id, number: s.number, name: s.name, views, annotations, count: guids.size };
  });
}
