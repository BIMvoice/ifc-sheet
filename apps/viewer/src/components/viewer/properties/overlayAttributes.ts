/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NewEntity } from '@ifc-lite/mutations';
import { getAttributeNames } from '@ifc-lite/parser';

/** Synthesize display attributes for overlay-only duplicates and scripted adds. */
export function attributesFromOverlayEntity(
  entity: NewEntity,
): Array<{ name: string; value: string }> {
  const names = getAttributeNames(entity.type) ?? [];
  if (names.length === 0) return [];
  const out: Array<{ name: string; value: string }> = [];
  const len = Math.min(names.length, entity.attributes.length);
  for (let i = 0; i < len; i++) {
    const value = entity.attributes[i];
    let display: string;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      if (value === '$' || value.length === 0) continue;
      display = value;
    } else if (typeof value === 'number') {
      display = String(value);
    } else if (typeof value === 'boolean') {
      display = value ? 'true' : 'false';
    } else {
      continue;
    }
    out.push({ name: names[i], value: display });
  }
  return out;
}
