/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's own line types as a saved project holds them (`lineTypes`), read as the app reads them
 * (`apps/viewer/src/drafting/line-types.ts`, `readLineType`): the same checks and the same wording, so a file the app refuses is refused here.
 */

import type { CustomLineType } from './draft-look.js';

const MAX_DASH_PARTS = 8;

/** The pattern as numbers, or null when it is not a usable dash pattern: an even count, none negative, gaps above zero. */
function dashPattern(parts: readonly unknown[]): number[] | null {
  const nums = parts.map(Number);
  if (nums.length < 2 || nums.length > MAX_DASH_PARTS || nums.length % 2 !== 0) return null;
  if (!nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return null;
  for (let i = 1; i < nums.length; i += 2) if (!(nums[i] > 0)) return null;
  return nums;
}

/** A line type read from a project file; throws on one that is not a line type, so a bad file says so. */
export function readLineType(v: unknown, path: string): CustomLineType {
  const o = v as { id?: unknown; name?: unknown; dash?: unknown } | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.name !== 'string') throw new Error(`Not a project file: ${path} must be a line type { id, name, dash }`);
  const dash = Array.isArray(o.dash) ? dashPattern(o.dash.flatMap((d) => String(d).trim().split(/[\s,;]+/).filter(Boolean))) : null;
  if (!dash) throw new Error(`Not a project file: ${path}/dash must be an even number of lengths in millimetres, gaps above zero`);
  return { id: o.id, name: o.name, dash };
}
