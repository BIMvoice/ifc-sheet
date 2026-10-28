/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ScanLevel } from '@/scan/scan-levels';
import { isObject } from '../project-read';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** A scan's levels as the user set them (name and floor height, drawing frame); its plans cut above them (`scan/`). Absent: no scan was drawn. */
    scanLevels?: ScanLevel[];
  }
}

/** A scan's levels; a level without an id, a name or a finite height is dropped. */
export const scanLevelsField = optionalField('scanLevels', (raw) => {
  if (!Array.isArray(raw.scanLevels)) return {};
  const levels = raw.scanLevels.filter((l): l is { id: string; name: string; elevation: number } => isObject(l) && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.elevation === 'number' && Number.isFinite(l.elevation));
  return levels.length ? { scanLevels: levels.map(({ id, name, elevation }) => ({ id, name, elevation })) } : {};
});
