/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Reading the project file's `dxfUnderlays` (#547): a damaged entry fails the file with its path, a missing optional value takes its default. The one reader, the app's too. */

import { DXF_UNDERLAY_MAX_POINTS, type DxfUnderlayLayer, type ViewDxfUnderlay } from './dxf-underlay.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

function readPoint(v: unknown, path: string): { x: number; y: number } {
  return isObject(v) && isNumber(v.x) && isNumber(v.y) ? { x: v.x, y: v.y } : fail(path, 'must be a point');
}

export function readDxfUnderlay(v: unknown, path: string, budget: { points: number }): ViewDxfUnderlay {
  if (!isObject(v)) fail(path, 'must be an object');
  if (!isString(v.id) || !isString(v.viewId)) fail(path, 'needs an id and a viewId');
  if (!Array.isArray(v.layers)) fail(`${path}/layers`, 'must be an array');
  const layers: DxfUnderlayLayer[] = v.layers.map((l: unknown, i): DxfUnderlayLayer => {
    const lp = `${path}/layers/${i}`;
    if (!isObject(l) || !isString(l.name) || !Array.isArray(l.runs)) return fail(lp, 'must have a name and runs');
    return {
      name: l.name,
      colour: isString(l.colour) ? l.colour : '#666666',
      visible: l.visible !== false,
      runs: l.runs.map((run: unknown, j) => {
        if (!Array.isArray(run) || run.length < 2) return fail(`${lp}/runs/${j}`, 'must be a run of at least two points');
        budget.points += run.length;
        if (budget.points > DXF_UNDERLAY_MAX_POINTS) fail(`${lp}/runs/${j}`, `goes over ${DXF_UNDERLAY_MAX_POINTS} points`);
        return run.map((p: unknown, k) => readPoint(p, `${lp}/runs/${j}/${k}`));
      }),
    };
  });
  const num = (key: string, ok: (n: number) => boolean, fallback: number): number => {
    const n = v[key];
    if (n === undefined) return fallback;
    return isNumber(n) && ok(n) ? n : fail(`${path}/${key}`, 'must be a valid number');
  };
  return {
    id: v.id,
    viewId: v.viewId,
    name: isString(v.name) ? v.name : 'DXF',
    layers,
    at: readPoint(v.at, `${path}/at`),
    scale: num('scale', (n) => n > 0, 1),
    rotation: num('rotation', () => true, 0),
    opacity: num('opacity', (n) => n >= 0 && n <= 1, 0.6),
    locked: v.locked === true,
    ...(Array.isArray(v.printOnSheets) && v.printOnSheets.some(isString) ? { printOnSheets: v.printOnSheets.filter(isString) } : {}),
  };
}

export function readDxfUnderlays(raw: Json): ViewDxfUnderlay[] {
  const list = raw.dxfUnderlays;
  if (list === undefined) return [];
  if (!Array.isArray(list)) fail('/dxfUnderlays', 'must be an array');
  const budget = { points: 0 };
  return list.map((u, i) => readDxfUnderlay(u, `/dxfUnderlays/${i}`, budget));
}
