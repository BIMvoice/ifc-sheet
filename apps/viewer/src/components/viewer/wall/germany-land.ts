/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GERMANY_SITE_SCALE, type GermanyLand } from '@bimvoice/ifcsheet';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { TranslationKey } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import { hangView } from '@/project/drawing-set-actions';
import { duplicateProjectView, permitPackOf, removeProjectItem, renameProjectItem, setGermanyLand, updateProjectView, useProjectStore } from '@/project/project-store';
import { setViewportScale, sheetsShowing, updateSheet } from '@/project/sheets';
import { armTemplate, useSetTemplates } from '@/set-template/store';
import { isSitePlan } from '@/siteplan/plot';
import { germanyTemplateFor } from './germany-template';

type Say = (key: TranslationKey) => string;

/** Draw the site plan `viewId` at `scale`: its view and every viewport of it, the box fitting the drawing again. */
function retune(viewId: string, scale: number): void {
  const { sheets, views } = useProjectStore.getState();
  const placed = sheets.flatMap((s) => (s.viewports ?? []).filter((vp) => vp.viewId === viewId).map((vp) => ({ sheetId: s.id, vp })));
  for (const { sheetId, vp } of placed) if (vp.scale !== scale) setViewportScale(sheetId, vp.id, viewId, scale);
  if (views.find((v) => v.id === viewId)?.scale !== scale) updateProjectView(viewId, { scale });
}

/**
 * Bring the sheets of a Germany project to `land` (the Lageplan's scale is the Land's, and Baden-Württemberg alone has an
 * Abstandsflächenplan): the Lageplan is drawn at the Land's scale; in Baden-Württemberg the Abstandsflächenplan is made (a second
 * ground-floor cut, with the note that the Abstandsflächen are still to be drawn) or kept; in another Land it is taken away, but
 * only while it is what this set made and nothing was drawn on it (a sheet with the person's drawing on it stays).
 * The caller runs this inside the one undo step of the Land change.
 */
function alignSheets(land: GermanyLand, t: Say, extent: ModelExtent | null): void {
  const scale = GERMANY_SITE_SCALE[land];
  const sites = useProjectStore.getState().views.filter((v) => isSitePlan(v) && !v.detail);
  const [lageplan, existing] = sites;
  if (!lageplan) return;
  retune(lageplan.id, scale);
  if (land === 'bw') {
    const setback = existing?.id ?? duplicateProjectView(lageplan.id);
    if (!setback) return;
    if (!existing) renameProjectItem(setback, t('germany.set.setback'));
    retune(setback, scale);
    if (sheetsShowing(setback).length === 0 && extent) {
      const sheetId = hangView(setback, extent);
      if (sheetId) updateSheet(sheetId, { name: t('germany.set.setback'), notes: [t('germany.set.setbackNote')] });
    }
    return;
  }
  if (!existing) return;
  const { drafts } = useProjectStore.getState();
  const holding = sheetsShowing(existing.id);
  const pristine = holding.every((s) => (s.viewports ?? []).length === 1 && s.name === t('germany.set.setback')) && !drafts.some((d) => d.viewId === existing.id);
  if (!pristine) return;
  for (const s of holding) removeProjectItem(s.id);
  removeProjectItem(existing.id);
}

/**
 * Choose the Land of a Germany project. The Land is one thing the sheets follow, so changing it brings them with it, as ONE undo
 * step (the field and the sheets are taken back together): see `alignSheets`. The armed Germany template, if one waits for the next
 * model, is made again for the new Land. `extent` (the loaded model's) is what a new Abstandsflächenplan sheet is laid out on;
 * without it the sheet is not made.
 */
export function chooseGermanyLand(land: GermanyLand | undefined, t: Say, extent: ModelExtent | null): void {
  runAsOneUndoStep(() => {
    setGermanyLand(land);
    if (permitPackOf(useProjectStore.getState()) === 'germany') alignSheets(land ?? 'other', t, extent);
  });
  const pending = useSetTemplates.getState().pending;
  if (pending && pending.name === t('germany.set.name')) armTemplate(germanyTemplateFor(t, land));
}
