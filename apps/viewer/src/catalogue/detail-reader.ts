/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The strict reader for a library detail, shared by the project file and the
 * catalogue file. A malformed entry fails with its path.
 */

import { readDraft, readDraftLayer } from '@bimvoice/ifcsheet';
import { fail, readSymbol } from './readers';
import type { LibraryDetail } from './types';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readLibraryDetail(v: unknown, path: string, what?: string): LibraryDetail {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !v.name.trim()) fail(path, 'must be a detail { id, name, drafts }', what);
  const list = (key: string): unknown[] => {
    const value = v[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(`${path}.${key}`, 'must be an array', what);
    return value;
  };
  const drafts = list('drafts').map((d, i) => {
    if (!isObject(d)) fail(`${path}.drafts/${i}`, 'must be a draft', what);
    const { viewId: _viewId, ...rest } = readDraft({ ...d, viewId: '' }, `${path}.drafts/${i}`);
    return rest;
  });
  return {
    id: v.id,
    name: v.name,
    scale: typeof v.scale === 'number' && Number.isFinite(v.scale) && v.scale > 0 ? v.scale : 100,
    drafts,
    layers: list('layers').map((l, i) => readDraftLayer(l, `${path}.layers/${i}`)),
    hatchPatterns: typeof v.hatchPatterns === 'string' ? v.hatchPatterns : '',
    symbols: list('symbols').map((s, i) => readSymbol(s, `${path}.symbols/${i}`, what)),
  };
}
