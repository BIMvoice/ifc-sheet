/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The fix of a title-block finding: one value into the field on every sheet that lacks it, and into the project's defaults. */

import { useProjectStore } from '@/project/project-store';
import { fillTitleBlock } from './fill';
import type { ProjectWideField } from './types';

/** Fills `field` and returns how many sheets took the value. */
export function fillTitleBlockEverywhere(field: ProjectWideField, value: string): number {
  const { sheets, titleBlockDefaults } = useProjectStore.getState();
  const result = fillTitleBlock(sheets, titleBlockDefaults ?? {}, field, value);
  if (result.filled === 0 && result.defaults[field] === titleBlockDefaults?.[field]) return 0;
  useProjectStore.setState({ sheets: result.sheets, titleBlockDefaults: result.defaults, dirty: true });
  return result.filled;
}
