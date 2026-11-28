/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for reloading the IFC model (`model-reload.en.ts`). The command name RELOADMODEL stays as typed. Term choices: `../ro-glossary.md`. */
export const modelReloadRo = {
  'modelReload.cmd': 'RELOADMODEL',
  'modelReload.action': 'Reîncarcă modelul IFC',
  'modelReload.reloading': 'Se reîncarcă modelul…',
  'modelReload.hint': 'Aduceți modelul așa cum a fost salvat din nou în programul de modelare. Proiectul, planșele, vederile și adnotările rămân și sunt desenate pe versiunea nouă.',
  'modelReload.busy': 'Un model se încarcă încă. Reîncărcați-l când s-a terminat.',
  'modelReload.noModel': 'Nu este încărcat niciun model de reîncărcat.',
  'modelReload.federation': 'Sunt încărcate mai multe modele. Reîncărcarea funcționează pentru un proiect desenat dintr-un singur model.',
  'modelReload.notCompared': 'Modelul nou este încărcat, dar nu s-a putut afla ce s-a schimbat în el.',
  'modelReload.done': {
    one: '{file} a fost reîncărcat. Proiectul rămâne; un element s-a modificat.',
    few: '{file} a fost reîncărcat. Proiectul rămâne; {count} elemente s-au modificat.',
    other: '{file} a fost reîncărcat. Proiectul rămâne; {count} de elemente s-au modificat.',
  },
  'modelReload.lost': {
    one: 'O adnotare și-a pierdut elementul. Este păstrată, iar Ce s-a modificat o listează.',
    few: '{count} adnotări și-au pierdut elementul. Sunt păstrate, iar Ce s-a modificat le listează.',
    other: '{count} de adnotări și-au pierdut elementul. Sunt păstrate, iar Ce s-a modificat le listează.',
  },
  'modelReload.failed': 'Modelul nu a putut fi reîncărcat: {reason}',
  'modelReload.show': 'Ce s-a modificat',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
