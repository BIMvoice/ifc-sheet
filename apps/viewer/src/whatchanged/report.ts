/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The changes sheet by sheet: for each sheet, the changed elements its views
 * show and the annotations on those views that lost or changed their element.
 * "A-101: 3 changes" counts elements, once each, however many views show them.
 * A sheet with nothing says so. Pure.
 */

import type { Pt } from '@/drafting/types';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import type { AnnotationImpact } from './impact';
import type { ModelChange } from './compare';
import { changesInRegion, changesInView, type ViewBand } from './visibility';

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

/** What a viewport shows of its view's drawing when it is cropped: a box on the paper round a drawing point, at the viewport's scale. Null: all of it. */
export function viewportRegion(vp: SheetViewport): { min: Pt; max: Pt } | null {
  if (!vp.center || !(vp.width > 0) || !(vp.height > 0)) return null;
  const k = vp.scale / 1000; // paper millimetres to drawing metres
  return { min: { x: vp.center.x - (vp.width / 2) * k, y: vp.center.y - (vp.height / 2) * k }, max: { x: vp.center.x + (vp.width / 2) * k, y: vp.center.y + (vp.height / 2) * k } };
}

export function sheetChanges(sheets: readonly ProjectSheet[], bands: readonly ViewBand[], changes: readonly ModelChange[], impacts: readonly AnnotationImpact[]): SheetChanges[] {
  const bandOf = new Map(bands.map((b) => [b.viewId, b] as const));
  const inView = new Map(bands.map((b) => [b.viewId, changesInView(changes, b)] as const));
  return sheets.map((s): SheetChanges => {
    const viewports = s.viewports ?? [];
    const viewIds = [...new Set(viewports.map((v) => v.viewId))];
    // A viewport that shows only part of its drawing shows only the changes in that part; a view on two viewports shows the union.
    const shown = new Map<string, Map<string, ModelChange>>();
    for (const vp of viewports) {
      const all = inView.get(vp.viewId) ?? [];
      const region = viewportRegion(vp);
      const plane = bandOf.get(vp.viewId)?.plane;
      const here = region && plane ? changesInRegion(all, plane, region) : all;
      const seen = shown.get(vp.viewId) ?? new Map<string, ModelChange>();
      for (const c of here) seen.set(c.guid, c);
      shown.set(vp.viewId, seen);
    }
    const views = viewIds.flatMap((viewId): ViewChanges[] => { const c = [...(shown.get(viewId)?.values() ?? [])]; return c.length ? [{ viewId, changes: c }] : []; });
    const onSheet = new Set(viewIds);
    const annotations = impacts.filter((i) => onSheet.has(i.viewId));
    const guids = new Set([...views.flatMap((v) => v.changes.map((c) => c.guid)), ...annotations.map((a) => a.guid)]);
    return { sheetId: s.id, number: s.number, name: s.name, views, annotations, count: guids.size };
  });
}
