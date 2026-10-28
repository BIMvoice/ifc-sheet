/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isNumber, isObject, isString } from '../project-read';
import { freshProjectId } from '../view-defaults';
import type { UserLevel } from '../types';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The levels the user defined for a model with no storeys (a glTF/GLB); absent or empty: none (`UserLevel`). */
    userLevels?: UserLevel[];
  }
}

/** The levels the person defined; an entry that is not a name and a height is dropped, and an id repeated is made new. */
export const userLevelsField = optionalField('userLevels', (raw) => {
  if (!Array.isArray(raw.userLevels)) return {};
  const seen = new Set<string>();
  const levels = raw.userLevels.flatMap((v): UserLevel[] => {
    if (!isObject(v) || !isString(v.name) || !v.name.trim() || !isNumber(v.elevation)) return [];
    const id = isString(v.id) && v.id && !seen.has(v.id) ? v.id : freshProjectId('level');
    seen.add(id);
    return [{ id, name: v.name, elevation: v.elevation }];
  });
  return levels.length ? { userLevels: levels } : {};
});
