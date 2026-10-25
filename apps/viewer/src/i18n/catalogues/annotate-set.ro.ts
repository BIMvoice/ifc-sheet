/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `annotate-set.en.ts` (#333). Term choices: `../ro-glossary.md`. The command names (TAGALL, DIMALL, LEVELALL) stay as typed; what a command says on a view is its own message (`annotate-all.ro.ts`). */
export const annotateSetRo = {
  'wall.annotate.open': 'Adnotați setul',
  'wall.annotate.title': 'Adnotați setul',
  'wall.annotate.hint': 'Rulează comenzile pe fiecare vedere de felul potrivit, fără ca vederea să fie deschisă, fiecare pe desenul ei, ca și cum le-ați rula acolo. Ce are deja o vedere nu se adaugă a doua oară. Un singur Undo anulează toată rularea.',
  'wall.annotate.tagall': 'Etichetați fiecare plan (TAGALL)',
  'wall.annotate.dimall': 'Cotați fiecare plan (DIMALL)',
  'wall.annotate.levelall': 'Cote de nivel pe fiecare fațadă și secțiune (LEVELALL)',
  'wall.annotate.run': 'Adnotați setul',
  'wall.annotate.stop': 'Oprire',
  'wall.annotate.nothingChosen': 'Alegeți cel puțin o comandă.',
  'wall.annotate.noViews': 'Setul nu are nicio vedere pe care să ruleze aceste comenzi.',
  'wall.annotate.progress': 'Se adnotează vederea {done} din {total}: {name}',
  'wall.annotate.result.total': 'Adăugate: {added}, pe {views} din {total} vederi.',
  'wall.annotate.result.stopped': 'Oprit înainte de ultimele vederi.',
  'wall.annotate.status.added': 'Adăugate: {count}',
  'wall.annotate.status.already': 'Deja adnotat',
  'wall.annotate.status.skipped': 'Omis',
  'wall.annotate.reason.noDrawing': 'Această vedere nu are un desen de adnotat ({error}).',
  'wall.annotate.reason.failed': 'Această vedere nu a putut fi adnotată ({error}).',
  'wall.annotate.reason.nothing': 'Nu e nimic de adnotat pe această vedere.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
