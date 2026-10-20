/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheets: paper, title block and the views placed on them as viewports.
 * All sheet geometry is paper millimetres from the top-left corner; a
 * viewport maps drawing metres to paper by its scale (1:N means 1 m is
 * 1000 / N mm).
 */

import { draftingFrame } from '@/drafting/drafting-view';
import { numberingScheme, useProjectStore } from './project-store';
import { withSources, type TitleSource } from './title-block-sources';
import { nextNumber } from './numbering';
import { sheetGroupOfView, withoutAutoNumber } from './sheet-numbers';
import { isRasterView } from './axonometric';
import { RASTER_BOX_MM } from './view-raster';
import { freshProjectId } from './view-defaults';
import { paperMm } from './paper';
import { templateFromSheet } from './sheet-templates';
import type { ProjectSheet, SheetViewport, TemplateSeries } from './types';

/** The scales a viewport offers, most detailed first: details, buildings, sites. */
export const SHEET_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000] as const;

/** The sheet's paper as it lies on the table: width and height in mm, by its paper and orientation. */
export function paperOf(sheet: ProjectSheet): { w: number; h: number } {
  return paperMm(sheet.paper ?? 'A1', sheet.orientation ?? 'landscape');
}

/** Paper millimetres per drawing metre for a viewport. */
export function mmPerMetre(viewport: Pick<SheetViewport, 'scale'>): number {
  return 1000 / viewport.scale;
}

function patchSheet(id: string, patch: (sheet: ProjectSheet) => ProjectSheet): void {
  const state = useProjectStore.getState();
  if (!state.sheets.some((s) => s.id === id)) return;
  useProjectStore.setState({ sheets: state.sheets.map((s) => (s.id === id ? patch(s) : s)), dirty: true });
}

export function updateSheet(id: string, patch: Partial<Omit<ProjectSheet, 'id' | 'viewports'>>): void {
  patchSheet(id, (s) => ({ ...s, ...patch }));
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
  patchSheet(id, (s) => ({ ...s, titleBlock: { ...s.titleBlock, [key]: value } }));
}

/** Stop `sheet` saying otherwise for `key`: it prints the project's value again. */
export function clearTitleBlockField(id: string, key: string): void {
  patchSheet(id, (s) => {
    if (!s.titleBlock || !(key in s.titleBlock)) return s;
    const titleBlock = { ...s.titleBlock };
    delete titleBlock[key];
    return { ...s, titleBlock };
  });
}

/** Set a title block field on every sheet: the project's value. Empty clears it. */
export function setProjectTitleBlockField(key: string, value: string): void {
  const titleBlock = { ...useProjectStore.getState().titleBlock };
  if (value) titleBlock[key] = value;
  else delete titleBlock[key];
  useProjectStore.setState({ titleBlock, dirty: true });
}

/** Choose the model sources a title block field reads (the order is the priority); `undefined` puts back the default. */
export function setTitleBlockSources(key: string, sources: readonly TitleSource[] | undefined): void {
  useProjectStore.setState({ titleBlockSources: withSources(useProjectStore.getState().titleBlockSources, key, sources), dirty: true });
}

/** Put a field back to the model: the typed value is dropped and its sources are the default. */
export function resetTitleBlockField(key: string): void {
  const titleBlock = { ...useProjectStore.getState().titleBlock };
  delete titleBlock[key];
  useProjectStore.setState({ titleBlock, titleBlockSources: withSources(useProjectStore.getState().titleBlockSources, key, undefined), dirty: true });
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
  const kind = view?.kind;
  // 0 × 0: the box fits the drawing once it is generated (see `viewportBox`). A drafting view has no drawing to
  // fit to: it is framed on its drafts; a raster has no drawing either, so it starts at a size.
  const frame = kind === 'drafting' ? draftingFrame(drafts.filter((d) => d.viewId === viewId), scale)
    : view && isRasterView(view) ? { center: null, width: RASTER_BOX_MM.width, height: RASTER_BOX_MM.height } : { center: null, width: 0, height: 0 };
  const viewport: SheetViewport = { id, viewId, x: at.x, y: at.y, scale, ...frame };
  patchSheet(sheetId, (s) => {
    // A number the program chose follows what the sheet comes to hold, once.
    const renumber = s.autoNumber && (s.viewports ?? []).length === 0;
    const series = renumber ? sheetGroupOfView(kind) : s.series;
    const number = renumber && series ? nextNumber(useProjectStore.getState().sheets.filter((o) => o.id !== s.id), series, numberingScheme()) : s.number;
    return { ...withoutAutoNumber(s), number, ...(series ? { series } : {}), viewports: [...(s.viewports ?? []), viewport] };
  });
  return id;
}

export function updateViewport(sheetId: string, viewportId: string, patch: Partial<Omit<SheetViewport, 'id' | 'viewId'>>): void {
  patchSheet(sheetId, (s) => ({ ...s, viewports: (s.viewports ?? []).map((v) => (v.id === viewportId ? { ...v, ...patch } : v)) }));
}

export function removeViewport(sheetId: string, viewportId: string): void {
  patchSheet(sheetId, (s) => ({ ...s, viewports: (s.viewports ?? []).filter((v) => v.id !== viewportId) }));
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

/** A viewport box that fits a drawing's extent at its scale (plus a margin), in paper mm. */
export function fitViewportBox(bounds: { min: { x: number; y: number }; max: { x: number; y: number } }, scale: number): { width: number; height: number } {
  const k = 1000 / scale;
  const margin = 10;
  return {
    width: Math.max(40, (bounds.max.x - bounds.min.x) * k + margin * 2),
    height: Math.max(30, (bounds.max.y - bounds.min.y) * k + margin * 2),
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
