/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `review.en.ts`: comments on a sheet. Term choices: `../ro-glossary.md`. */
export const reviewRo = {
  'review.tool': 'Comentariu',
  'review.tool.hint': 'Faceți clic pe planșă, acolo unde se referă comentariul',
  'review.title': 'Comentarii',
  'review.name': 'Numele dumneavoastră',
  'review.text': 'Comentariu',
  'review.placeholder': 'Scrieți un comentariu, Enter pentru a-l salva',
  'review.pin': 'Comentariul {n} de {author}',
  'review.anon': 'Cineva',
  'review.status.done': 'Rezolvat',
  'review.status.open': 'Deschis',
  'review.onElement': 'Pe un element al modelului',
  'review.reply': 'Răspunde',
  'review.replyPlaceholder': 'Răspundeți, Enter pentru a trimite',
  'review.reopen': 'Redeschide',
  'review.done': 'Marchează ca rezolvat',
  'review.delete': 'Șterge comentariul',
  'review.close': 'Închide',
  'review.badge': 'Comentarii deschise la {name}: {count}',
  'review.empty': 'Niciun comentariu deschis.',
  'review.openCount': '{count} deschise',
  'review.showDone': 'Arată cele rezolvate',
  'review.bcf.export': 'Exportă BCF',
  'review.bcf.import': 'Importă BCF',
  'review.bcf.none': 'Niciun comentariu nu se află pe un element al modelului, deci nu e nimic de exportat.',
  // The count is the number of comments, so the noun takes its form from it: 1 comentariu, 2 comentarii, 20 de comentarii.
  'review.bcf.exported': {
    one: 'Comentariul se află pe un element al modelului și a intrat în fișierul BCF.',
    few: 'În fișierul BCF au intrat comentariile de pe elementele modelului: {onElement} din {count} comentarii.',
    other: 'În fișierul BCF au intrat comentariile de pe elementele modelului: {onElement} din {count} de comentarii.',
  },
  'review.bcf.exportFailed': 'Fișierul BCF nu a putut fi scris: {reason}',
  'review.bcf.imported': {
    one: 'Un subiect a devenit comentariu. Comentarii existente cu răspunsuri sau o stare nouă: {merged}. Subiecte lăsate deoparte, fără niciun element pe vreo planșă: {unplaced}.',
    few: '{count} subiecte au devenit comentarii. Comentarii existente cu răspunsuri sau o stare nouă: {merged}. Subiecte lăsate deoparte, fără niciun element pe vreo planșă: {unplaced}.',
    other: '{count} de subiecte au devenit comentarii. Comentarii existente cu răspunsuri sau o stare nouă: {merged}. Subiecte lăsate deoparte, fără niciun element pe vreo planșă: {unplaced}.',
  },
  'review.bcf.failed': 'Fișierul BCF nu a putut fi citit.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
