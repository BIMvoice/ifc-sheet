/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Romanian for the ByggesaksBIM (Norway) opt-in and its findings' controls (#372). The findings' sentences are the engine's Romanian, in `READINESS_RO`. */
export const byggesaksbimRo = {
  'ready.byggesaksbim.label': 'ByggesaksBIM (Norge)',
  'ready.byggesaksbim.hint': 'Verifică modelul față de cele șapte cerințe obligatorii (Obligatorisk) din raportul DiBK P13 eByggesak: număr matrikkel, BYA, tipul clădirii, BTA și BRA pe nivel, zone bruksenhet, tipul liftului. Ce nu respectă apare în listă. Oprit: nu se rulează nimic.',
  'ready.byggesaksbim.select': 'Selectează primul element',
} as const satisfies Record<string, TranslationValue>;
