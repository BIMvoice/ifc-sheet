/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { CellValue } from './result-types.js';
import type { ColumnDefinition, ListDataProvider } from './types.js';

/** The cell of an `officeClassification` column (#351): the code, or the title for `propertyName: 'Title'`; empty when the provider has no answer. */
export function officeClassificationValue(entityId: number, col: ColumnDefinition, provider: ListDataProvider): CellValue {
  const answer = provider.getOfficeClassification?.(entityId, col.psetName);
  return (col.propertyName === 'Title' ? answer?.title : answer?.code) || null;
}
