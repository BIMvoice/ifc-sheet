/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "A quantity, or missing" (#411): the one rule for a sum over rows that may not state the value. A row that does not state it is left
 * out of the sum (never counted as 0); a sum over rows of which NONE states it is missing (`null`), written as a dash. A declared 0 is
 * a quantity and sums and prints as 0. The bill of quantities (`computeBoq`), the Lists engine's summary and groups, the export model
 * and the Lists panel all sum through `SumTally`, so a total cannot be 0 in one and a dash in another.
 */

/** How a missing quantity is written. */
export const MISSING_QUANTITY = '–';

/** A running sum and how many values stated it. */
export interface SumTally { sum: number; counted: number }

export const emptyTally = (): SumTally => ({ sum: 0, counted: 0 });

/** Add one cell: a finite number is a quantity, anything else (null, text, NaN) states none. */
export function tallyValue(tally: SumTally, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) { tally.sum += value; tally.counted++; }
}

/** Add a part that was itself summed (a subgroup's total): `null` states none. */
export function tallyPart(tally: SumTally, part: number | null | undefined): void {
  if (typeof part === 'number' && Number.isFinite(part)) { tally.sum += part; tally.counted++; }
}

/** The sum, or `null` (missing) when no value stated it. */
export const tallyTotal = (tally: SumTally): number | null => (tally.counted > 0 ? tally.sum : null);

/** A zeroed tally per id. */
export const tallies = (ids: readonly string[]): Record<string, SumTally> => Object.fromEntries(ids.map((id) => [id, emptyTally()]));

/** The totals of a set of tallies, by id. */
export function tallyTotals(set: Record<string, SumTally>): Record<string, number | null> {
  return Object.fromEntries(Object.entries(set).map(([id, t]) => [id, tallyTotal(t)]));
}

/** A quantity as text: the dash when it is missing, else `format(value)`. */
export function quantityText(value: number | null | undefined, format: (n: number) => string): string {
  return typeof value === 'number' && Number.isFinite(value) ? format(value) : MISSING_QUANTITY;
}

/** Order for sorting sums: a missing quantity before every stated one (0 included). */
export function compareQuantities(a: number | null | undefined, b: number | null | undefined): number {
  const x = typeof a === 'number' ? a : null;
  const y = typeof b === 'number' ? b : null;
  if (x === null || y === null) return x === y ? 0 : x === null ? -1 : 1;
  return x - y;
}
