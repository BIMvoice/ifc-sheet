/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The urban settings of a project file (`terrainLevel`, `zeroElevation`, `cutExcluded`); a field that is not what it should be is dropped (its default applies). One reader for the app and the command line. */

import type { UrbanSettings } from './urban-indicators.js';

export function readUrbanSettings(raw: unknown): UrbanSettings | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out: UrbanSettings = {};
  if (finite(r.terrainLevel)) out.terrainLevel = r.terrainLevel;
  if (finite(r.zeroElevation)) out.zeroElevation = r.zeroElevation;
  if (typeof r.cutExcluded === 'object' && r.cutExcluded !== null && !Array.isArray(r.cutExcluded)) {
    const chosen = Object.entries(r.cutExcluded).filter((e): e is [string, boolean] => typeof e[1] === 'boolean');
    if (chosen.length) out.cutExcluded = Object.fromEntries(chosen);
  }
  return Object.keys(out).length ? out : undefined;
}
