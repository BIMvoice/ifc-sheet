/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Reading a saved model state back: a malformed one is refused with the place of the problem, and changes nothing else. */

import type { ModelSnapshot, SnapElement } from './snapshot';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

function readElement(v: unknown, path: string): SnapElement {
  if (!isObject(v) || !isString(v.k) || !isString(v.t) || !isString(v.d)) fail(path, 'must be an element { k, t, d }');
  if (v.n !== undefined && !isString(v.n)) fail(`${path}/n`, 'must be text');
  if (v.g !== undefined && !isString(v.g)) fail(`${path}/g`, 'must be text');
  if (v.p !== undefined && !isString(v.p)) fail(`${path}/p`, 'must be text');
  if (v.a !== undefined && !(Array.isArray(v.a) && v.a.length === 6 && v.a.every((n) => typeof n === 'number' && Number.isFinite(n)))) fail(`${path}/a`, 'must be six numbers');
  if (v.c !== undefined && !(isObject(v.c) && Object.values(v.c).every(isString))) fail(`${path}/c`, 'must map names to hashes');
  return { k: v.k, t: v.t, d: v.d, ...(v.n !== undefined ? { n: v.n as string } : {}), ...(v.g !== undefined ? { g: v.g as string } : {}), ...(v.p !== undefined ? { p: v.p as string } : {}), ...(v.a !== undefined ? { a: v.a as number[] } : {}), ...(v.c !== undefined ? { c: v.c as Record<string, string> } : {}) };
}

export function readSnapshot(raw: unknown, path: string): ModelSnapshot {
  if (!isObject(raw)) fail(path, 'must be a model state { takenAt, elements }');
  if (typeof raw.takenAt !== 'number' || !Number.isFinite(raw.takenAt)) fail(`${path}/takenAt`, 'must be a number');
  if (!Array.isArray(raw.elements)) fail(`${path}/elements`, 'must be an array');
  return { takenAt: raw.takenAt, elements: raw.elements.map((e, i) => readElement(e, `${path}/elements/${i}`)) };
}
