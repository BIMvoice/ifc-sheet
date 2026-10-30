/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the revisions of a project file. A record without an id or a code is
 * refused with its place; a missing date, description or author is empty.
 */

import type { ProjectRevision } from './revisions.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

export function readRevisions(raw: unknown): ProjectRevision[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail('/revisions', 'must be an array');
  const ids = new Set<string>();
  return raw.map((v, i): ProjectRevision => {
    const path = `/revisions/${i}`;
    if (!isObject(v) || typeof v.id !== 'string' || !v.id) fail(path, 'must be a revision { id, code }');
    if (typeof v.code !== 'string') fail(`${path}/code`, 'must be text');
    if (ids.has(v.id)) fail(`${path}/id`, `"${v.id}" is used by two revisions`);
    ids.add(v.id);
    const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : '');
    return { id: v.id, code: v.code, date: text('date'), description: text('description'), by: text('by') };
  });
}
