/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How the takeoff and the quantities by type tell a measured figure from a
 * declared one (#74): on paper a figure with any part measured from the
 * geometry carries a `*` (the room schedule's mark for a measured area), and a
 * note under the table says what it means and how many figures could not be
 * measured; in the CSV and XLSX a column names the measured figures of a row.
 * A model whose figures are all declared prints exactly as before.
 */

import type { TableItem } from '@bimvoice/ifcsheet';
import { wrapNote } from '@/urban/urban-layout';

/** The words, in the user's language. */
export interface MeasuredWords {
  /** What the `*` means, and how the areas are measured. */
  note: string;
  /** `count` elements state no figure and their geometry gives none either. */
  unmeasured: (count: number) => string;
  /** The CSV and XLSX column, and the names of the figures in it. */
  column: string;
  volume: string;
  area: string;
}

export const MEASURED_MARK = ' *';

/** `text` with the mark when `measured`. */
export const marked = (text: string, measured: boolean): string => (measured ? `${text}${MEASURED_MARK}` : text);

/** The CSV cell naming a row's measured figures; null when none is. */
export function measuredCell(volume: boolean, area: boolean, words: MeasuredWords): string | null {
  const names = [...(volume ? [words.volume] : []), ...(area ? [words.area] : [])];
  return names.length ? names.join(', ') : null;
}

const GAP = 4;

/** The notes under a table: the mark's meaning when a figure is marked, the count of unmeasured ones when any; none without words. */
export function measuredNoteItems(anyMeasured: boolean, unmeasured: number, words: MeasuredWords | undefined): TableItem[] {
  if (!words) return [];
  const notes = [...(anyMeasured ? [words.note] : []), ...(unmeasured > 0 ? [words.unmeasured(unmeasured)] : [])].flatMap((n) => wrapNote(n, 110));
  if (notes.length === 0) return [];
  return [{ kind: 'gap', h: GAP }, ...notes.map((text): TableItem => ({ kind: 'text', h: GAP, dy: GAP, size: 2, text }))];
}
