/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The Romanian permit project (PAC, Legea 169/2026 Anexa 2): its checklist and the sheets it starts a set with (#364). */
export const pacEn = {
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
  'pac.useSet': 'Use the PAC sheets for a new project',
  'pac.set.name': 'PAC',
  'pac.set.plans': 'Floor plans',
  'pac.set.facades': 'Facades',
  'pac.set.sections': 'Main sections',
  'pac.item.siteLocation': 'Location plan',
  'pac.item.situationExisting': 'Site plan, existing situation',
  'pac.item.situationProposed': 'Site plan, proposed situation',
  'pac.item.plans': 'Plans of all levels, with the function of each space',
  'pac.item.roof': 'Roof and terrace plan',
  'pac.item.facades': 'Facades',
  'pac.item.sections': 'Main sections, showing the ground profile',
  'pac.item.context': 'Graphic and photo documentation of the neighbours, landscape and visual impact',
  'pac.item.utilities': 'Plan of the utility connections on public land',
  'pac.item.engineeringDrawings': 'Engineering drawings at principle level (structure, services)',
  'pac.item.architectureMemo': 'Architecture technical memo',
  'pac.item.specialtyMemos': 'Specialty technical memos',
  'pac.item.neighbourExpertise': 'Technical expertise on the influence on neighbouring buildings',
  'pac.item.geotechnical': 'Verified geotechnical documentation',
  'pac.item.calculationBrief': 'Calculation brief (consequence classes CC3 and CC4)',
  'pac.item.diagnosis': 'Diagnosis of the existing building',
  'pac.item.structuralExpertise': 'Technical assessment of strength and stability',
  'pac.item.survey': 'Detailed survey of the existing situation',
} as const satisfies Record<string, TranslationValue>;
