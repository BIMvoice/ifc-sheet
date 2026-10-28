/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `tag-fields.en.ts`: which IFC property feeds each field of a tag. Term choices: `../ro-glossary.md`. */
export const tagFieldsRo = {
  'tagFields.title': 'Câmpurile etichetei',
  'tagFields.hint': 'Ce proprietate IFC alimentează fiecare câmp al unei etichete. Se ia prima sursă care are o valoare; etichetele se actualizează imediat. Etichetele de element plasate cu TAG păstrează Eticheta și Numele așa cum au fost scrise, până când câmpul lor este setat aici.',
  'tagFields.kind': 'Tipul etichetei',
  'tagFields.preview.on': 'Previzualizare pe',
  'tagFields.preview.none': 'Modelul încărcat nu are niciun element de acest tip pentru previzualizare.',
  'tagFields.preview.reads': 'Eticheta citește: {value}',
  'tagFields.preview.fallback': 'Nicio valoare, deci eticheta revine la nume: {value}',
  'tagFields.src.attribute': 'Atribut {path}',
  'tagFields.src.pset': 'Proprietate {path}',
  'tagFields.src.quantity': 'Cantitate {path}',
  'tagFields.src.typePset': 'Proprietate de tip {path}',
  'tagFields.source.empty': '(nicio valoare)',
  'tagFields.source.up': 'Mută {name} mai sus',
  'tagFields.source.down': 'Mută {name} mai jos',
  'tagFields.source.remove': 'Elimină {name}',
  'tagFields.noSources': 'Nicio sursă: acest câmp rămâne gol.',
  'tagFields.reset': 'Înapoi la valoarea implicită',
  'tagFields.add.kind': 'Tipul sursei',
  'tagFields.add.attribute': 'Atribut',
  'tagFields.add.path': 'Set și nume',
  'tagFields.add.pathHint': 'Pset_DoorCommon.Reference',
  'tagFields.add.button': 'Adaugă sursa',
  'tagFields.kind.door': 'Uși',
  'tagFields.kind.window': 'Ferestre',
  'tagFields.kind.room': 'Încăperi',
  'tagFields.kind.wall': 'Pereți',
  'tagFields.kind.other': 'Alte elemente',
  'tagFields.field.mark': 'Marcaj',
  'tagFields.field.name': 'Nume',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
