/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `dxf-view.en.ts` (#547). Term choices: `../ro-glossary.md`. */
export const dxfViewRo = {
  'dxfView.cmd': 'DXFALIGN',
  'dxfView.prompt.from1': 'Faceți clic pe un prim punct de pe DXF:',
  'dxfView.prompt.from2': 'Faceți clic pe un al doilea punct de pe DXF:',
  'dxfView.prompt.to1': 'Faceți clic unde se află primul punct, pe model:',
  'dxfView.prompt.to2': 'Faceți clic unde se află al doilea punct, pe model:',
  'dxfView.msg.none': 'Această vedere nu are un fundal DXF. Adăugați mai întâi un DXF.',
  'dxfView.msg.locked': 'DXF-ul este blocat. Deblocați-l ca să îl aliniați.',
  'dxfView.msg.bad': 'DXF-ul nu a putut fi aliniat: fiecare pereche de puncte trebuie să fie două puncte diferite.',
  'dxfView.msg.aligned': 'DXF-ul este aliniat: cele două puncte sunt pe cele două puncte ale modelului.',
  'dxfView.heading': 'Desen DXF',
  'dxfView.hint': 'Așezați sub acest plan un plan sau un releveu DXF, ca linii. Aliniați-l prin două puncte, porniți sau opriți straturile lui și alegeți planșele care îl tipăresc.',
  'dxfView.add': 'Adăugați un DXF',
  'dxfView.importing': 'Se citește DXF-ul...',
  'dxfView.failed': 'DXF-ul nu a putut fi adăugat: {reason}',
  'dxfView.remove': 'Eliminați',
  'dxfView.align': 'Aliniere prin două puncte',
  'dxfView.layers': 'Straturi',
  'dxfView.opacity': 'Opacitate',
  'dxfView.lock': 'Blocați poziția',
  'dxfView.printsHeading': 'DXF-ul se tipărește pe planșa',
  'dxfView.noSheets': 'Acest desen nu este încă pe o planșă.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
