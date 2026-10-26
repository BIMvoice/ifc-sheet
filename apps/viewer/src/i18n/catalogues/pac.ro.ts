/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';
import { PAC_WORDS_RO } from '@bimvoice/ifcsheet/pac-words';

/** Romanian for `pac.en.ts`. Term choices: `../ro-glossary.md`. */
export const pacRo = {
  ...PAC_WORDS_RO,
  'pac.title': 'Proiect pentru autorizarea construirii (PAC), Legea 169/2026',
  'pac.intro': 'Conținutul proiectului pentru autorizarea construirii, cum îl enumeră Anexa 2 la Legea 169/2026. DTAC este denumirea de dinainte de 25 august 2026.',
  'pac.drawn': 'Desenat din model',
  'pac.supply': 'De furnizat',
  'pac.point': 'Anexa 2, {point}',
  'pac.scales': 'Scara 1:{list}, după caz',
  'pac.scales.adequate': 'Scară: „o scară adecvată”, textul nu indică una',
  'pac.kind.drawing': 'Piese desenate',
  'pac.kind.written': 'Piese scrise',
  'pac.kind.existingBuilding': 'Lucrări la o clădire existentă',
  'pac.notSet': 'Nu rezultă din text, deci nu este stabilit aici: formatul planșelor și ordinea lor.',
  'pac.submit': 'Generează PDF-ul de depunere',
  'pac.submit.hint': 'Un singur PDF: opisul (conținutul de mai sus, fiecare piesă cu punctul din Anexa 2 și cu mențiunea dacă fișierul o conține), apoi planșele în ordinea setului. Se înregistrează ca emitere. Textul nu indică formatul hârtiei, ordinea planșelor și nici regulile de fișiere pentru platforma electronică, deci nu se aplică niciuna.',
  'pac.submit.working': 'Se generează PDF-ul de depunere…',
  'pac.useSet': 'Folosește planșele PAC pentru un proiect nou',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
