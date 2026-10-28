/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the tour's step card and its prerequisites dialog (`tours.en.ts`). Term choices: `../ro-glossary.md`. */
export const toursRo = {
  'tours.tourStepCard.ariaLabel': 'Pasul {step} din {total} al turului: {title}',
  'tours.tourStepCard.endTourAriaLabel': 'Încheie turul',
  'tours.tourStepCard.redockedNotice': 'Panoul a fost fixat la loc în bara laterală pentru acest pas.',
  'tours.tourStepCard.stuckHint': 'Sunteți blocat? Săriți peste acest pas și mergeți mai departe.',
  'tours.tourStepCard.skipStep': 'Omite pasul',
  'tours.tourStepCard.skipUseDemo': 'Omite (demo)',
  'tours.tourStepCard.done': 'Gata',
  'tours.tourStepCard.next': 'Înainte',
  'tours.tourHost.prereqAriaLabel': '{title}: cerințe prealabile',
  'tours.tourHost.prereqLayerStack': 'Acest tur are nevoie de o stivă de straturi compusă. Încărcați stiva demonstrativă (trei straturi mici) ca să urmăriți turul.',
  'tours.tourHost.prereqSecondModel': 'Acest tur are nevoie de două revizii încărcate ale unui model. Încărcați proiectul demonstrativ ca să urmăriți turul.',
  'tours.tourHost.prereqModel': 'Acest tur are nevoie de un model încărcat. Încărcați proiectul demonstrativ ca să urmăriți turul sau deschideți mai întâi propriul fișier IFC.',
  'tours.tourHost.cancel': 'Anulează',
  'tours.tourHost.loadDemoStack': 'Încarcă stiva demonstrativă',
  'tours.tourHost.loadDemoProject': 'Încarcă proiectul demonstrativ',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
