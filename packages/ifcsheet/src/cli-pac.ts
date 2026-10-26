/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --pac` (#364): the permit project (PAC, Legea 169/2026 Anexa 2) as one submission PDF. The sheets are
 * the PAC set template's, in the words of `--locale` (Romanian by default), and the PDF opens with the opis page
 * (`pac-submission.ts`). Everything else in `build` (the PDF writer, the DXF, the handover) is unchanged.
 */

import type { SetTemplate } from './set-template.js';
import { pacSetTemplate } from './pac-set.js';
import { pacSubmissionSheets } from './pac-submission.js';
import { pacWordsFor } from './pac-words.js';
import type { SheetGraphic } from './sheet-graphic.js';

/** The language of the PAC words when `--locale` is not given: the permit is Romanian. */
export const PAC_DEFAULT_LOCALE = 'ro';

/** The set template that draws the PAC architecture sheets, named in `locale`. */
export function pacTemplateFor(locale: string): SetTemplate {
  const w = pacWordsFor(locale);
  return pacSetTemplate({ name: w['pac.set.name'], plans: w['pac.set.plans'], facades: w['pac.set.facades'], sections: w['pac.set.sections'] });
}

/** The pages of the submission: the opis, then the sheets of `set` as drawn. */
export function pacPages(sheets: readonly SheetGraphic[], set: { document: { name: string; sheets: readonly { id: string; series?: string }[] } }, locale: string): SheetGraphic[] {
  const seriesOf = new Map(set.document.sheets.map((s) => [s.id, s.series]));
  return pacSubmissionSheets(sheets, sheets.map((s) => ({ series: seriesOf.get(s.sheetId) })), locale, set.document.name);
}
