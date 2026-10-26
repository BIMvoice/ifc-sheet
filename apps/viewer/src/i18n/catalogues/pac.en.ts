/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
import { PAC_WORDS_EN } from '@bimvoice/ifcsheet/pac-words';

/** The Romanian permit project (PAC, Legea 169/2026 Anexa 2): its checklist and the sheets it starts a set with (#364). */
export const pacEn = {
  ...PAC_WORDS_EN,
  'pac.title': 'Permit project (PAC), Legea 169/2026',
  'pac.intro': 'The contents of the permit project, "proiectul pentru autorizarea construirii", as Anexa 2 of Legea 169/2026 lists them. DTAC is the name it had before 25 August 2026.',
  'pac.drawn': 'Drawn from the model',
  'pac.supply': 'To supply',
  'pac.point': 'Anexa 2, {point}',
  'pac.scales': 'Scale 1:{list}, as the case may be',
  'pac.scales.adequate': 'Scale: "a suitable scale", the text names none',
  'pac.kind.drawing': 'Drawings',
  'pac.kind.written': 'Written parts',
  'pac.kind.existingBuilding': 'Works on an existing building',
  'pac.notSet': 'Not stated by the text, so not set here: the paper format and the order of the sheets.',
  'pac.submit': 'Build the submission PDF',
  'pac.submit.hint': 'One PDF: the opis (the contents above, each with its Anexa 2 point and whether this file holds it), then the sheets in set order. Recorded as an issue. The text names no paper format, sheet order or file rules for the e-portal, so none is applied.',
  'pac.submit.working': 'Building the submission PDF…',
  'pac.useSet': 'Use the PAC sheets for a new project',
} as const satisfies Record<string, TranslationValue>;
