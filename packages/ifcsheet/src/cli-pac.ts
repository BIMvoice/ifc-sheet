/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --pac` (#364): the permit project (PAC, Legea 169/2026 Anexa 2) as one submission PDF. The sheets are
 * the PAC set template's, in the words of the run's language (`resolveLanguage`: the project's, else `--locale`, else Romanian), and the PDF opens with the opis page
 * (`pac-submission.ts`). Everything else in `build` (the PDF writer, the DXF, the handover) is unchanged.
 */

import type { ProjectDocument } from './document.js';
import type { SetTemplate } from './set-template.js';
import { pacSetTemplate, type PacIntervention, type PacMode } from './pac-set.js';
import { pacRuralSetTemplate } from './pac-rural-set.js';
import { pacSubmissionSheets } from './pac-submission.js';
import { pacWordsFor } from './pac-words.js';
import type { SheetGraphic } from './sheet-graphic.js';

/** The language of the PAC words when `--locale` is not given: the permit is Romanian. */
export const PAC_DEFAULT_LOCALE = 'ro';

/** The set template that draws the PAC architecture sheets, named in `locale`: Anexa 2's, or for `rural` the simplified Anexa 3's (1:50, A3 stepping up). */
export function pacTemplateFor(locale: string, mode: PacMode = 'full'): SetTemplate {
  const w = pacWordsFor(locale);
  return (mode === 'rural' ? pacRuralSetTemplate : pacSetTemplate)({ name: w['pac.set.name'], plans: w['pac.set.plans'], facades: w['pac.set.facades'], sections: w['pac.set.sections'] });
}

/**
 * The pages of the submission: the opis, then the sheets of `set` as drawn. The opis is the one the app's issued PDF has (`pacOpisOf`).
 * The opis lists Anexa 2's contents, so a `rural` project (Anexa 3) has none, as in the app: its pages are the sheets.
 */
export function pacPages(sheets: readonly SheetGraphic[], set: { document: ProjectDocument }, locale: string, intervention?: PacIntervention, mode: PacMode = 'full'): SheetGraphic[] {
  if (mode === 'rural') return [...sheets];
  const drawn = new Set(sheets.map((s) => s.sheetId));
  const { document } = set;
  return pacSubmissionSheets(sheets, { name: document.name, sheets: document.sheets.filter((s) => drawn.has(s.id)), views: document.views, titleBlock: document.titleBlock, intervention }, locale);
}
