/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `standards-packs.en.ts`. Term choices: `../ro-glossary.md`. */
export const standardsPacksRo = {
  'standards.pack.title': 'Standard de desenare',
  'standards.pack.intro': 'Instalează dintr-un singur pas un standard de desenare al biroului. O singură anulare le retrage pe toate, iar „Revino” readuce proiectul la valorile lui.',
  'standards.pack.ro-stas.description': 'Practica românească de desenare, pe grosimile de linie ISO 128 și literele ISO 3098: grosimi de linie și de hașuri, cartușul, virgulă la zecimale, hașuri pe materiale după denumirile românești, numerotarea implicită a planșelor. Sunt valorile pe care IfcSheet le are deja; niciuna nu a fost verificată încă față de un text STAS.',
  'standards.pack.de-din.description': 'Practica germană de desenare, pe grosimile de linie ISO 128 și literele ISO 3098: grosimi de linie și de hașuri, un cartuș cu texte în germană, virgulă la zecimale, hașuri pe materiale după denumirile germane, numerotarea implicită a planșelor. Sunt valorile pentru care IfcSheet poate indica o sursă ISO; niciuna nu a fost verificată încă față de DIN 1356-1.',
  'standards.pack.part.pens': 'Grosimi de linie, de hașuri și litere',
  'standards.pack.part.titleBlock': 'Cartuș',
  'standards.pack.part.units': 'Format numeric',
  'standards.pack.part.numbering': 'Numerotarea planșelor',
  'standards.pack.part.hatches': 'Hașuri pe materiale',
  'standards.pack.notSet': 'Rămân cum le are proiectul: {list}',
  'standards.pack.notSet.lengthUnit': 'unitatea de lungime',
  'standards.pack.notSet.decimals': 'zecimalele',
  'standards.pack.notSet.viewTemplates': 'șabloanele de vedere',
  'standards.pack.install': 'Instalează standardul',
  'standards.pack.applied': 'Instalat',
  'standards.pack.current': 'Standard instalat: {name}',
  'standards.pack.reset': 'Revino la valorile anterioare',
  'standards.pack.export': 'Salvează ca .bvlib',
  'standards.pack.fromFile': 'Instalează din fișier...',
  'standards.pack.fromFile.label': 'Fișier cu pachet de standard',
  'standards.pack.refused': 'Nu s-a instalat: {reason}',
  // The Tables text style (#512) lives in the drafting standards dialog; these
  // move to `drafting-standards.ro.ts` once that catalogue lands.
  'standards.tables.name': 'Tabele',
  'standards.tables.make': 'Adaugă un stil Tabele',
  'standards.tables.fontsNote': 'Tabelele, rapoartele și registrul de planșe urmează acest stil (font și cursiv). Sunt oferite doar cele trei fonturi pe care PDF-ul le poate scrie: fără serife (Inter), cu serife (Times) și monospațiat (Courier). Dimensiunile rămân cum sunt.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
