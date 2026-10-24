/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheets: paper, title block and the views placed on them as viewports.
 * All sheet geometry is paper millimetres from the top-left corner; a
 * viewport maps drawing metres to paper by its scale (1:N means 1 m is
 * 1000 / N mm).
 */

import { draftingFrame, draftsExtent } from '@/drafting/drafting-view';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { numberingScheme, updateProjectView, useProjectStore } from './project-store';
import { nextNumber } from './numbering';
import { withSources, type TitleSource } from './title-block-sources';
import { sheetGroupOfView, withoutAutoNumber } from './sheet-numbers';
import { isRasterView } from './axonometric';
import { RASTER_BOX_MM } from './view-raster';
import { freshProjectId } from './view-defaults';
import { fitViewportBox } from '@bimvoice/ifcsheet';
import { templateFromSheet } from './sheet-templates';
import { isGeometry, type DraftEntity } from '@/drafting/types';
import { annotationAtFactor, annotationFactor } from './viewport-annotation';
import type { ProjectSheet, SheetViewport, TemplateSeries } from './types';

// The viewport scales, the sheet's paper and the box that fits a drawing are the engine's (`viewport-fit.ts`).
export { SHEET_SCALES, fitViewportBox, mmPerMetre, paperOf } from '@bimvoice/ifcsheet';

function patchSheet(id: string, patch: (sheet: ProjectSheet) => ProjectSheet): void {
  const state = useProjectStore.getState();
  if (!state.sheets.some((s) => s.id === id)) return;
  useProjectStore.setState({ sheets: state.sheets.map((s) => (s.id === id ? patch(s) : s)), dirty: true });
}

export function updateSheet(id: string, patch: Partial<Omit<ProjectSheet, 'id' | 'viewports'>>): void {
  runAsOneUndoStep(() => {
    patchSheet(id, (s) => ({ ...s, ...patch }));
  });
}

/** Save how a sheet is set up (paper, orientation, frame) as a project template under `name`; the sheet then counts as started from it. Returns the template's id. */
export function saveSheetTemplate(sheetId: string, name: string): string | null {
  const state = useProjectStore.getState();
  const sheet = state.sheets.find((s) => s.id === sheetId);
  const trimmed = name.trim();
  if (!sheet || !trimmed) return null;
  const template = templateFromSheet(sheet, trimmed);
  useProjectStore.setState({ sheetTemplates: [...(state.sheetTemplates ?? []), template], dirty: true });
  patchSheet(sheetId, (s) => ({ ...s, templateId: template.id }));
  return template.id;
}

/** New sheets of `series` start from the template `id` (a built-in or the project's); `null` goes back to the smallest paper that fits. */
export function setSeriesTemplate(series: TemplateSeries, id: string | null): void {
  const { [series]: _was, ...rest } = useProjectStore.getState().seriesTemplates ?? {};
  useProjectStore.setState({ seriesTemplates: id ? { ...rest, [series]: id } : rest, dirty: true });
}

/** `sheet` says otherwise for `key` than the project's title block (`title-block.ts`). */
export function setTitleBlockField(id: string, key: string, value: string): void {
  runAsOneUndoStep(() => {
    patchSheet(id, (s) => ({ ...s, titleBlock: { ...s.titleBlock, [key]: value } }));
  });
}

/** Stop `sheet` saying otherwise for `key`: it prints the project's value again. */
export function clearTitleBlockField(id: string, key: string): void {
  runAsOneUndoStep(() => {
    patchSheet(id, (s) => {
      if (!s.titleBlock || !(key in s.titleBlock)) return s;
      const titleBlock = { ...s.titleBlock };
      delete titleBlock[key];
      return { ...s, titleBlock };
    });
  });
}

/** Set a title block field on every sheet: the project's value. Empty clears it. */
export function setProjectTitleBlockField(key: string, value: string): void {
  runAsOneUndoStep(() => {
    const titleBlock = { ...useProjectStore.getState().titleBlock };
    if (value) titleBlock[key] = value;
    else delete titleBlock[key];
    useProjectStore.setState({ titleBlock, dirty: true });
  });
}

/** Choose the model sources a title block field reads (the order is the priority); `undefined` puts back the default. */
export function setTitleBlockSources(key: string, sources: readonly TitleSource[] | undefined): void {
  runAsOneUndoStep(() => {
    useProjectStore.setState({ titleBlockSources: withSources(useProjectStore.getState().titleBlockSources, key, sources), dirty: true });
  });
}

/** Put a field back to the model: the typed value is dropped and its sources are the default. */
export function resetTitleBlockField(key: string): void {
  runAsOneUndoStep(() => {
    const titleBlock = { ...useProjectStore.getState().titleBlock };
    delete titleBlock[key];
    useProjectStore.setState({ titleBlock, titleBlockSources: withSources(useProjectStore.getState().titleBlockSources, key, undefined), dirty: true });
  });
}

/** Fill the project title block fields not set yet (from the model when a set is laid out); set ones stay. */
export function seedProjectTitleBlock(fields: Record<string, string>): void {
  const current = useProjectStore.getState().titleBlock ?? {};
  const missing = Object.entries(fields).filter(([key, value]) => value && !current[key]);
  if (missing.length > 0) useProjectStore.setState({ titleBlock: { ...current, ...Object.fromEntries(missing) }, dirty: true });
}

/** Place a view on a sheet, centred at a paper point. Returns the viewport id. */
export function addViewport(sheetId: string, viewId: string, at: { x: number; y: number }, scale = 100): string {
  const id = freshProjectId('viewport');
  const { views, drafts } = useProjectStore.getState();
  const view = views.find((v) => v.id === viewId);
  // 0 × 0: the box fits the drawing once it is generated (see `viewportBox`); a raster has no drawing to fit, so it starts at a size;
  // a drafting view has no drawing to fit to either: it is framed on its drafts.
  const box = view?.kind === 'drafting' ? draftingFrame(drafts.filter((d) => d.viewId === viewId), scale)
    : view && isRasterView(view) ? { width: RASTER_BOX_MM.width, height: RASTER_BOX_MM.height, center: null } : { width: 0, height: 0, center: null };
  const viewport: SheetViewport = { id, viewId, x: at.x, y: at.y, scale, ...box };
  runAsOneUndoStep(() => patchSheet(sheetId, (s) => {
    // A number the program chose follows what the sheet comes to hold, once.
    const renumber = s.autoNumber && (s.viewports ?? []).length === 0;
    const series = renumber ? sheetGroupOfView(view) : s.series;
    const number = renumber && series ? nextNumber(useProjectStore.getState().sheets.filter((o) => o.id !== s.id), series, numberingScheme()) : s.number;
    return { ...withoutAutoNumber(s), number, ...(series ? { series } : {}), viewports: [...(s.viewports ?? []), viewport] };
  }));
  return id;
}

/** A move of a continuation page (`page` above 0) marks it `placed`: it is then the user's, and keeps its place (`syncSchedulePages`). */
const movesPage = (v: SheetViewport, patch: Partial<SheetViewport>): boolean => (v.page ?? 0) > 0 && ((patch.x !== undefined && patch.x !== v.x) || (patch.y !== undefined && patch.y !== v.y));

export function updateViewport(sheetId: string, viewportId: string, patch: Partial<Omit<SheetViewport, 'id' | 'viewId'>>): void {
  patchSheet(sheetId, (s) => ({ ...s, viewports: (s.viewports ?? []).map((v) => (v.id === viewportId ? { ...v, ...patch, ...(movesPage(v, patch) ? { placed: true } : {}) } : v)) }));
}

/** `updateViewport` as ONE undo step: the edit of a field, a size or a fit made once, not the live writes of a drag (those group themselves at the end of the drag). */
export function editViewport(sheetId: string, viewportId: string, patch: Partial<Omit<SheetViewport, 'id' | 'viewId'>>): void {
  runAsOneUndoStep(() => updateViewport(sheetId, viewportId, patch));
}

/** Draw a viewport at `scale`: its box fits the drawing again, and the view's annotation sizes follow (`view`, when it has one). One undo step. */
export function setViewportScale(sheetId: string, viewportId: string, viewId: string | null, scale: number): void {
  runAsOneUndoStep(() => {
    updateViewport(sheetId, viewportId, { scale, width: 0, height: 0 });
    if (viewId) updateProjectView(viewId, { scale });
  });
}

export function removeViewport(sheetId: string, viewportId: string): void {
  runAsOneUndoStep(() => {
    patchSheet(sheetId, (s) => ({ ...s, viewports: (s.viewports ?? []).filter((v) => v.id !== viewportId) }));
  });
}

/** The sheets a view is placed on (a view usually sits on one sheet, as in Revit). */
export function sheetsShowing(viewId: string, sheets: readonly ProjectSheet[] = useProjectStore.getState().sheets): ProjectSheet[] {
  return sheets.filter((s) => (s.viewports ?? []).some((v) => v.viewId === viewId));
}

/** The viewport's box on the paper: its own size, or the drawing's extent when it fits automatically. */
export function viewportBox(vp: SheetViewport, bounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null): { width: number; height: number } {
  if (vp.width > 0 && vp.height > 0) return { width: vp.width, height: vp.height };
  return bounds ? fitViewportBox(bounds, vp.scale) : { width: 120, height: 80 };
}

/** Whether the viewport fits its content by itself (no manual size). A manual size is a crop, and a crop clips. */
export const autoFits = (vp: Pick<SheetViewport, 'width' | 'height'>): boolean => !(vp.width > 0 && vp.height > 0);

type Extent = { min: { x: number; y: number }; max: { x: number; y: number } };

/**
 * The extent an auto-fit viewport frames: the drawing's bounds together with
 * its view's drafts, so a dimension, text or tag drawn beyond the model prints
 * (#140). A viewport with a manual size keeps `bounds`: it crops on purpose.
 */
export function fitExtent(vp: Pick<SheetViewport, 'width' | 'height' | 'scale'>, bounds: Extent, drafts: readonly Pick<DraftEntity, 'shape'>[], viewScale: number | undefined): Extent {
  // The sheet prints annotation at the viewport's scale (`annotationAtFactor`), so the extent is measured the same way.
  const factor = annotationFactor(vp.scale, viewScale);
  const printed = factor === 1 ? drafts : drafts.map((d) => (isGeometry(d.shape) ? d : { ...d, shape: annotationAtFactor(d.shape, factor) }));
  const extent = autoFits(vp) ? draftsExtent(printed) : null;
  if (!extent) return bounds;
  return {
    min: { x: Math.min(bounds.min.x, extent.min.x), y: Math.min(bounds.min.y, extent.min.y) },
    max: { x: Math.max(bounds.max.x, extent.max.x), y: Math.max(bounds.max.y, extent.max.y) },
  };
}

/** Add `revisionId` to the revisions a sheet lists by choice (it lists the ones its clouds name regardless). */
export function addSheetRevision(sheetId: string, revisionId: string): void {
  patchSheet(sheetId, (s) => ((s.revisionIds ?? []).includes(revisionId) ? s : { ...s, revisionIds: [...(s.revisionIds ?? []), revisionId] }));
}

/** Take `revisionId` off the revisions chosen for a sheet; a cloud of it on the sheet still names it. */
export function removeSheetRevision(sheetId: string, revisionId: string): void {
  patchSheet(sheetId, (s) => {
    if (!(s.revisionIds ?? []).includes(revisionId)) return s;
    const { revisionIds: _all, ...rest } = s;
    const left = (s.revisionIds ?? []).filter((id) => id !== revisionId);
    return left.length > 0 ? { ...rest, revisionIds: left } : rest;
  });
}
