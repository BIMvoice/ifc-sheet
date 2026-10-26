/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ColumnDefinition, ListRow } from '@ifc-lite/lists';

/** A column is numeric (summable) when every sampled non-empty value is a
 *  finite number and at least one such value exists. */
export function detectNumericColumns(columns: ColumnDefinition[], rows: ListRow[]): boolean[] {
  const sample = rows.slice(0, 120);
  return columns.map((_, i) => {
    let sawNumber = false;
    for (const r of sample) {
      const v = r.values[i];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'number' && Number.isFinite(v)) { sawNumber = true; continue; }
      return false;
    }
    return sawNumber;
  });
}
