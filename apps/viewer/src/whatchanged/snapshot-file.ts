/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Reading a saved model state back: a malformed one is refused with the place of the problem, and changes nothing else. */

import type { ModelSnapshot } from './snapshot';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

const isRow = (r: unknown, classes: number, paths: number): boolean =>
  Array.isArray(r) && r.length === 8 && typeof r[0] === 'string' && Number.isInteger(r[1]) && r[1] >= 0 && r[1] < classes && typeof r[2] === 'string'
  && typeof r[3] === 'string' && Number.isInteger(r[4]) && r[4] >= -1 && r[4] < paths && typeof r[5] === 'string'
  && Array.isArray(r[6]) && (r[6].length === 0 || (r[6].length === 6 && r[6].every((n: unknown) => Number.isInteger(n)))) && typeof r[7] === 'string';

/** A saved model state read back; a malformed one is refused with the place of the problem. */
export function readSnapshot(raw: unknown, path: string): ModelSnapshot {
  if (!isObject(raw)) fail(path, 'must be a model state { takenAt, count, rows }');
  if (typeof raw.takenAt !== 'number' || !Number.isFinite(raw.takenAt)) fail(`${path}/takenAt`, 'must be a number');
  if (!Number.isInteger(raw.count) || (raw.count as number) < 0) fail(`${path}/count`, 'must be a whole number');
  if (typeof raw.rows !== 'string') fail(`${path}/rows`, 'must be the elements as text');
  let data: unknown;
  try { data = JSON.parse(raw.rows); } catch { fail(`${path}/rows`, 'is not readable'); }
  if (!isObject(data) || !Array.isArray(data.classes) || !Array.isArray(data.paths) || !Array.isArray(data.rows)) fail(`${path}/rows`, 'must hold classes, paths and rows');
  const { classes, paths, rows } = data as { classes: unknown[]; paths: unknown[]; rows: unknown[] };
  if (!classes.every((c) => typeof c === 'string') || !paths.every((c) => typeof c === 'string')) fail(`${path}/rows`, 'must list classes and containers as text');
  const bad = rows.findIndex((r) => !isRow(r, classes.length, paths.length));
  if (bad >= 0) fail(`${path}/rows/${bad}`, 'must be an element row');
  if (rows.length !== raw.count) fail(`${path}/count`, `says ${raw.count} elements, the rows hold ${rows.length}`);
  return { takenAt: raw.takenAt, count: rows.length, rows: raw.rows };
}
