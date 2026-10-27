/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading a sheet's paper, title block and viewports from a project file.
 * Lenient where a default is obvious (paper A1 landscape), strict where a
 * value is malformed (a viewport without a view or a positive scale).
 */

import { readSheetParams, readTitleBlock } from '@bimvoice/ifcsheet';
import { NUMBER_GROUPS, typedBeforeSchemes } from './numbering';
import { readPaper } from './paper';
import { readFrame } from './sheet-frame';
import type { NumberGroup, ProjectSheet, SheetViewport } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string';

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

/** The positions kept for continuation pages that are not there (`SheetViewport.placedPages`): only whole entries survive. */
function readPlacedPages(v: unknown): { placedPages?: { page: number; x: number; y: number }[] } {
  const kept = (Array.isArray(v) ? v : []).flatMap((e) => (isObject(e) && isNumber(e.page) && Number.isInteger(e.page) && e.page > 0 && isNumber(e.x) && isNumber(e.y) ? [{ page: e.page, x: e.x, y: e.y }] : []));
  return kept.length ? { placedPages: kept } : {};
}

function readViewport(v: unknown, path: string): SheetViewport {
  if (!isObject(v) || !isString(v.id) || !isString(v.viewId)) fail(path, 'must be a viewport { id, viewId }');
  if (!isNumber(v.scale) || v.scale <= 0) fail(`${path}.scale`, 'must be a positive scale denominator');
  const num = (key: string, fallback: number) => (isNumber(v[key]) ? (v[key] as number) : fallback);
  const center = isObject(v.center) && isNumber(v.center.x) && isNumber(v.center.y) ? { x: v.center.x, y: v.center.y } : null;
  return {
    id: v.id, viewId: v.viewId, scale: v.scale,
    x: num('x', 100), y: num('y', 100), width: Math.max(0, num('width', 0)), height: Math.max(0, num('height', 0)), center,
    ...(Array.isArray(v.hiddenLayers) ? { hiddenLayers: v.hiddenLayers.filter((x): x is string => typeof x === 'string') } : {}),
    ...(isNumber(v.page) && Number.isInteger(v.page) && v.page > 0 ? { page: v.page } : {}),
    ...(v.placed === true && isNumber(v.page) && v.page > 0 ? { placed: true } : {}),
    ...readPlacedPages(v.placedPages),
    ...(isString(v.keyPlanOf) && v.keyPlanOf ? { keyPlanOf: v.keyPlanOf } : {}),
    ...(isString(v.drawingNumber) && v.drawingNumber.trim() ? { drawingNumber: v.drawingNumber.trim() } : {}),
  };
}

/** The optional sheet layout fields, read from `v` (already known to be an object). */
export function readSheetLayout(v: Json, path: string): Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId' | 'viewports' | 'titleBlock' | 'autoNumber' | 'numberOverride' | 'series' | 'revisionIds' | 'titleBlockParams' | 'notes'> {
  const out: Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId' | 'viewports' | 'titleBlock' | 'autoNumber' | 'numberOverride' | 'series' | 'revisionIds' | 'titleBlockParams' | 'notes'> = {};
  if (v.autoNumber === true) out.autoNumber = true;
  if (v.numberOverride === true) out.numberOverride = true;
  // Saved before schemes: no series, no override mark. A number outside the old A-nnn series was typed by hand and keeps that protection.
  else if (v.series === undefined && v.autoNumber !== true && typeof v.number === 'string' && typedBeforeSchemes(v.number)) out.numberOverride = true;
  if (NUMBER_GROUPS.includes(v.series as NumberGroup)) out.series = v.series as NumberGroup;
  // A plain `'A1'` (every file saved before elongated and custom sizes) is ISO A1; a paper that is none is left unnamed.
  const paper = readPaper(v.paper);
  if (paper) out.paper = paper;
  const frame = readFrame(v.frame);
  if (frame) out.frame = frame;
  if (isString(v.templateId)) out.templateId = v.templateId;
  if (v.orientation === 'portrait' || v.orientation === 'landscape') out.orientation = v.orientation;
  if (v.viewports !== undefined) {
    if (!Array.isArray(v.viewports)) fail(`${path}.viewports`, 'must be an array');
    out.viewports = v.viewports.map((vp, i) => readViewport(vp, `${path}.viewports/${i}`));
  }
  const titleBlock = readTitleBlock(v.titleBlock);
  if (titleBlock) out.titleBlock = titleBlock;
  if (Array.isArray(v.revisionIds)) out.revisionIds = v.revisionIds.filter(isString);
  const notes = Array.isArray(v.notes) ? v.notes.filter((n): n is string => isString(n) && n.trim() !== '') : [];
  if (notes.length > 0) out.notes = notes;
  const titleBlockParams = readSheetParams(v.titleBlockParams);
  if (titleBlockParams) out.titleBlockParams = titleBlockParams;
  return out;
}

export { readTitleBlock };
