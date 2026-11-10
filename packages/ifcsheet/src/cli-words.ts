/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the text output of `rooms`, `boq`, `materials`, `classify` and `check` writes around its tables (closing lines,
 * counts, notes), English and Romanian, in the language the command resolved (`cli-language.ts`). The same shape as the
 * bill of quantities' words (`boq-words.ts`): templates with `{name}` parameters filled by `fillTemplate`, so a language
 * keeps its own word order. Figures inside a sentence arrive already written by the one formatter (`sheetNumber`).
 */

import { fillTemplate } from './boq-words.js';
import type { NameLanguage } from './names.js';

export const CLI_WORDS_EN = {
  'rooms.summary': '{rooms} rooms; areas from {fromQuantity} model quantity, {fromGeometry} geometry{none}. Left out: {external} external, {gfa} area-scheme (GFA), {parents} split into rooms of their own.',
  'rooms.none': ', {count} none',
  'boq.missing': '{count} elements lack a quantity an article takes: {list}.',
  'materials.none': 'No materials in the model.',
  'materials.membrane': 'membrane (heavy dashed line)',
  'materials.hatchNone': 'hatch none',
  'materials.hatch': 'hatch {hatch} x{scale}, {pen} pen',
  'materials.fill': 'fill {fill}',
  'materials.guessed': 'guessed from the name',
  'materials.fromProject': 'from the project',
  'classify.noType': ' (no type)',
  'classify.fromModel': '[model]',
  'classify.noCode': '{count} elements have no code.',
  'check.ready': 'the model has what the drawing set reads: storeys, rooms, materials, quantities.',
  'check.lacksOne': '1 thing the model lacks',
  'check.lacksMany': '{count} things the model lacks',
} as const;

export type CliWordKey = keyof typeof CLI_WORDS_EN;

export const CLI_WORDS_RO: Record<CliWordKey, string> = {
  'rooms.summary': '{rooms} încăperi; arii: {fromQuantity} din cantitatea modelului, {fromGeometry} din geometrie{none}. Excluse: {external} exterioare, {gfa} din schema de arii (GFA), {parents} împărțite în încăperi proprii.',
  'rooms.none': ', {count} fără arie',
  'boq.missing': '{count} elemente nu au o cantitate pe care o ia un articol: {list}.',
  'materials.none': 'Modelul nu are materiale.',
  'materials.membrane': 'membrană (linie întreruptă groasă)',
  'materials.hatchNone': 'fără hașură',
  'materials.hatch': 'hașură {hatch} x{scale}, pix {pen}',
  'materials.fill': 'umplere {fill}',
  'materials.guessed': 'dedus din denumire',
  'materials.fromProject': 'din proiect',
  'classify.noType': ' (fără tip)',
  'classify.fromModel': '[din model]',
  'classify.noCode': '{count} elemente fără cod.',
  'check.ready': 'modelul are ce citește setul de planșe: niveluri, încăperi, materiale, cantități.',
  'check.lacksOne': '1 lucru care lipsește modelului',
  'check.lacksMany': '{count} lucruri care lipsesc modelului',
};

/** Says a word of the command line's text in `language`. */
export type CliSay = (key: CliWordKey, params?: Record<string, string | number>) => string;

export function cliSayFor(language: NameLanguage): CliSay {
  const words: Record<CliWordKey, string> = language === 'ro' ? CLI_WORDS_RO : CLI_WORDS_EN;
  return (key, params) => fillTemplate(words[key], params);
}
