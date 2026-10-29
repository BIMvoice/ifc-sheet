/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `document` (#526). Term choices: `../ro-glossary.md`. */
export const documentRo = {
  'document.preview.idsReportBlankGroup': '(gol)',
  'document.preview.idsReportCardinality': 'Elemente aplicabile',
  'document.preview.idsReportCardinalityFound': 'Găsite: {actual}',
  'document.preview.idsReportCardinalityMet': 'Îndeplinit',
  'document.preview.idsReportCardinalityNotMet': 'Neîndeplinit',
  'document.preview.idsReportChecked': 'Verificate',
  'document.preview.idsReportChecksCount': {
    one: "{countDisplay} verificare",
    few: "{countDisplay} verificări",
    other: "{countDisplay} de verificări",
  },
  'document.preview.idsReportCountsUnavailableShort': 'indisponibil',
  'document.preview.idsReportError': 'Nu a putut fi evaluat: {error}',
  'document.preview.idsReportFailed': 'Eșuate',
  'document.preview.idsReportGeneratedAt': 'Validare rulată: {timestamp}',
  'document.preview.idsReportHeading': 'Raport IDS: {name}',
  'document.preview.idsReportNoChecks': 'Nicio verificare în acest raport.',
  'document.preview.idsReportPassed': 'Reușite',
  'document.preview.idsReportWarningTag': 'Avertisment',
  'document.preview.idsReportWarnings': 'Avertismente',
  'document.preview.rulesReportHeading': 'Raport de validare a informațiilor: {name}',
  'document.print.actual': 'Real {value}',
  'document.print.bandFrameTooShort': 'Antetul și subsolul lasă prea puțin loc pentru acest bloc. Micșorați-le înălțimea sau dimensiunea blocului.',
  'document.print.cardinalityAtLeast': 'cel puțin {min}',
  'document.print.cardinalityAtMost': 'cel mult {max}',
  'document.print.cardinalityExactly': 'exact {min}',
  'document.print.cardinalityRange': 'între {min} și {max}',
  'document.print.comment': 'Comentariu: {comment}',
  'document.print.expected': 'Așteptat {value}',
  'document.print.footer': 'Generat {timestamp} · {app}',
  'document.print.moreSets': 'Alte seturi nu sunt afișate',
  'document.print.noGroupChecks': 'Nicio verificare în acest grup.',
  'document.print.pageCounter': 'Pagina {page} / {total}',
  'document.print.partialCounts': 'Verificate {checked} · Reușite/eșuate indisponibile (raport parțial)',
  'document.print.passPercent': '{percent}% reușite',
  'document.print.setLimit': 'Rularea validării a limitat rezultatele pe seturi',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
