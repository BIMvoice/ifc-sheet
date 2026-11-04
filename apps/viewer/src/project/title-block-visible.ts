/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which title block fields the panel lists (#653). The fields F_01 of Romanian practice adds (registration number,
 * professional titles, capacity of the authors, the verifier's capacity, requirement and report) mean nothing to a
 * project drawn to another standard, so the panel leaves them out until something asks for them: the Romanian
 * standards pack is installed, the project's layout prints one, or the field already holds a value (a field with
 * data is never hidden).
 */

import { FIELD_PARAMS, type TitleBlockField } from '@bimvoice/ifcsheet';
import type { TitleBlockTemplate } from './title-block-template';

/** The title block fields that only the Romanian layout uses. */
export const ROMANIAN_ONLY_FIELDS: readonly TitleBlockField[] = [
  'registrationNumber', 'projectManagerTitle', 'designerTitle', 'drawnByTitle', 'authorsCapacity', 'verifierCapacity', 'verifierRequirement', 'reportNumber', 'reportDate',
];

/** The id of the Romanian standards pack (`standards/standard-pack.ts`). */
const ROMANIAN_PACK_ID = 'ro-stas';

export interface TitleBlockVisibility {
  /** What the panel shows in the field now (typed or from the model). */
  value: string;
  template: TitleBlockTemplate | undefined;
  installedStandardId: string | undefined;
}

export function titleBlockFieldShown(key: TitleBlockField, on: TitleBlockVisibility): boolean {
  if (!ROMANIAN_ONLY_FIELDS.includes(key)) return true;
  if (on.value.trim() !== '' || on.installedStandardId === ROMANIAN_PACK_ID) return true;
  const param = `{${FIELD_PARAMS[key]}}`;
  return on.template?.items.some((item) => item.kind === 'text' && item.text.includes(param)) ?? false;
}
