/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Changing a viewport's scale on a sheet (#450): the sheet's other drawings follow by the generated set's own layout
 * (`relaySheet`), as one undo step, when the person has not arranged the sheet by hand. On a hand-arranged sheet only the
 * viewport changes, and the caller offers `relaySheetAt` (also one undo step).
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { getLocale } from '@/i18n';
import { relaySheet, sheetIsAsLaid, type ModelExtent } from '@bimvoice/ifcsheet';
import { updateProjectView, useProjectStore } from './project-store';
import { setViewportScale } from './sheets';

/** What a scale change did to the sheet: `relaid` all its drawings, `kept` them where the person put them (offer `relaySheetAt`), or `alone` (nothing to lay: a schedule, a single page). */
export type ScaleChange = 'relaid' | 'kept' | 'alone';

/** Lay `sheetId` out again at `wanted` (the viewports' scale becomes the one that fits, with a note when it is not `wanted`). False when the sheet holds something the layout does not place. */
export function relaySheetAt(sheetId: string, wanted: number, extent: ModelExtent): boolean {
  const { sheets, views } = useProjectStore.getState();
  const sheet = sheets.find((s) => s.id === sheetId);
  const laid = sheet && relaySheet(sheet, views, extent, wanted, getLocale());
  if (!sheet || !laid) return false;
  runAsOneUndoStep(() => {
    useProjectStore.setState({ sheets: sheets.map((s) => (s.id === sheetId ? { ...s, viewports: laid.viewports, notes: laid.notes.length > 0 ? laid.notes : undefined } : s)), dirty: true });
    for (const vp of laid.viewports) {
      const view = views.find((v) => v.id === vp.viewId);
      if (view && view.scale !== laid.scale) updateProjectView(view.id, { scale: laid.scale });
    }
  });
  return true;
}

/** Draw a viewport at `scale`, and lay its sheet out again when the sheet is as the layout left it. One undo step. */
export function changeViewportScale(sheetId: string, viewportId: string, viewId: string | null, scale: number, extent: ModelExtent): ScaleChange {
  const { sheets, views } = useProjectStore.getState();
  const sheet = sheets.find((s) => s.id === sheetId);
  const untouched = !!sheet && (sheet.viewports?.length ?? 0) > 1 && sheetIsAsLaid(sheet, views, extent);
  let result: ScaleChange = 'alone';
  runAsOneUndoStep(() => {
    setViewportScale(sheetId, viewportId, viewId, scale);
    if (untouched) result = relaySheetAt(sheetId, scale, extent) ? 'relaid' : 'alone';
    else if ((sheet?.viewports?.length ?? 0) > 1) result = 'kept';
  });
  return result;
}
