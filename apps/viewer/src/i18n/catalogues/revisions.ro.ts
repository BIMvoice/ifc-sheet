/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `revisions.en.ts` and the revision keys of the Wall's card and the sheet's table. Term choices: `../ro-glossary.md`. */
export const revisionsRo = {
  'issue.currentOnly': 'Afișați doar norii de revizie ai reviziei curente a fiecărei planșe',
  'wall.draw.revcloud': 'Nor de revizie',
  'wall.draw.revcloud.body': 'Faceți clic în două colțuri opuse: în jurul lor se desenează un nor pentru revizia aleasă mai jos.',
  'revision.title': 'Revizii',
  'revision.card.hint': 'Reviziile setului. O planșă listează reviziile cărora le aparțin norii ei, plus cele bifate aici; cartușul ei citește ultima revizie.',
  'revision.empty': 'Nicio revizie încă.',
  'revision.add': 'Adaugă o revizie',
  'revision.done': 'Gata',
  'revision.code': 'Codul reviziei',
  'revision.date': 'Data',
  'revision.description': 'Descriere',
  'revision.by': 'De',
  'revision.onSheet': 'Listată pe această planșă',
  'revision.byCloud': 'Un nor de pe această planșă îi aparține, deci rămâne listată.',
  'revision.remove': 'Elimină această revizie și norii ei',
  'revision.remove.ask': {
    one: 'Eliminați revizia {code} și norul ei, de pe toate planșele? Anularea le readuce pe amândouă.',
    few: 'Eliminați revizia {code} și cei {count} nori ai ei, de pe toate planșele? Anularea îi readuce.',
    other: 'Eliminați revizia {code} și cei {count} de nori ai ei, de pe toate planșele? Anularea îi readuce.',
  },
  'revision.remove.yes': 'Elimină',
  'revision.remove.no': 'Păstrează',
  'revision.msg.none': 'Nu există nicio revizie încă. Adăugați mai întâi una la Revizii; un nor aparține unei revizii.',
  'revision.cloudFor': 'Norul aparține reviziei',
  'revision.tbDerived': 'Cartușul citește ultima revizie a planșei.',
  'revision.table.code': 'Rev.',
  'revision.table.date': 'Data',
  'revision.table.description': 'Descriere',
  'revision.table.by': 'De',
  'revision.table.earlier': {
    one: 'O revizie anterioară nu este afișată',
    few: '{count} revizii anterioare nu sunt afișate',
    other: '{count} de revizii anterioare nu sunt afișate',
  },
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
