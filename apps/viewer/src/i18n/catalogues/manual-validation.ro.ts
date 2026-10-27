/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `manual-validation` (#526). Term choices: `../ro-glossary.md`. */
export const manualValidationRo = {
  'manualValidation.item.untitled': 'Verificare fără titlu',
  'manualValidation.name.placeholder': 'Listă de verificare fără titlu',
  'manualValidation.report.heading': 'Validare manuală: {name}',
  'manualValidation.report.noGroups': 'Nicio verificare în această listă.',
  'manualValidation.report.passed': '{percent}% reușite ({pass} din {total} verificări)',
  'manualValidation.report.recordedAt': 'Înregistrat: {timestamp}',
  'manualValidation.report.recordedAtModel': 'Model: {model} · Înregistrat: {timestamp}',
  'manualValidation.report.untitledGroup': 'Grup fără titlu',
  'manualValidation.verdict.fail': 'Respins',
  'manualValidation.verdict.pass': 'Admis',
  'manualValidation.verdict.unanswered': 'Neverificat',
  'manualValidation.verdict.warning': 'Avertisment',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
