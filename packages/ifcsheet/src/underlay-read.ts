/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Reading the project file's `underlays` (#457): a damaged entry fails the file with its path, a missing optional one takes its default. The one reader, the app's too. */

import { isUnderlayHref, type ViewUnderlay } from './underlay.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

export function readUnderlay(v: unknown, path: string): ViewUnderlay {
  if (!isObject(v)) fail(path, 'must be an object');
  const num = (key: string, ok: (n: number) => boolean, fallback?: number): number => {
    const n = v[key];
    if (n === undefined && fallback !== undefined) return fallback;
    if (!isNumber(n) || !ok(n)) fail(`${path}/${key}`, 'must be a valid number');
    return n;
  };
  if (!isString(v.id) || !isString(v.viewId)) fail(path, 'needs an id and a viewId');
  if (!isUnderlayHref(v.href)) fail(`${path}/href`, 'must be a PNG or JPEG data URL within the size cap');
  const at = isObject(v.at) && isNumber(v.at.x) && isNumber(v.at.y) ? { x: v.at.x, y: v.at.y } : fail(`${path}/at`, 'must be a point');
  return {
    id: v.id,
    viewId: v.viewId,
    name: isString(v.name) ? v.name : 'Underlay',
    kind: v.kind === 'pdf' ? 'pdf' : 'image',
    ...(isNumber(v.page) && Number.isInteger(v.page) && v.page >= 1 ? { page: v.page } : {}),
    href: v.href,
    widthPx: num('widthPx', (n) => Number.isInteger(n) && n > 0),
    heightPx: num('heightPx', (n) => Number.isInteger(n) && n > 0),
    at,
    mPerPx: num('mPerPx', (n) => n > 0),
    rotation: num('rotation', () => true, 0),
    opacity: num('opacity', (n) => n >= 0 && n <= 1, 0.5),
    locked: v.locked === true,
    ...(Array.isArray(v.printOnSheets) && v.printOnSheets.some(isString) ? { printOnSheets: v.printOnSheets.filter(isString) } : {}),
  };
}

export function readUnderlays(raw: Json): ViewUnderlay[] {
  const list = raw.underlays;
  if (list === undefined) return [];
  if (!Array.isArray(list)) fail('/underlays', 'must be an array');
  return list.map((u, i) => readUnderlay(u, `/underlays/${i}`));
}
