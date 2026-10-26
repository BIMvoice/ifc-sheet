/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of the Romanian permit project (PAC, Legea 169/2026 Anexa 2, #364): the names of its items and of the sheets
 * its set starts with, and the opis page of the submission PDF. The one copy: the app's catalogues (`pac.en.ts`,
 * `pac.ro.ts`) spread these and the command line prints them. Imports nothing, so a catalogue loads it without the parser.
 * Romanian follows `apps/viewer/src/i18n/ro-glossary.md` (ș and ț with the comma below).
 */

export const PAC_WORDS_EN = {
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
  'pac.opis.title': 'Opis: permit project (PAC)',
  'pac.opis.law': 'Legea 169/2026, Anexa 2: contents of the permit project',
  'pac.opis.project': 'Project: {name}',
  'pac.opis.col.point': 'Anexa 2',
  'pac.opis.col.item': 'Item',
  'pac.opis.col.included': 'In this file',
  'pac.opis.yes': 'Yes',
  'pac.opis.no': 'No',
  'pac.opis.na': 'Not applicable',
  'pac.opis.sheets': 'Sheets in this file, in set order',
  'pac.opis.col.page': 'Page',
  'pac.opis.col.sheet': 'Sheet',
} as const;

export const PAC_WORDS_RO: Record<keyof typeof PAC_WORDS_EN, string> = {
  'pac.set.name': 'PAC',
  'pac.set.plans': 'Planuri de nivel',
  'pac.set.facades': 'Fațade',
  'pac.set.sections': 'Secțiuni principale',
  'pac.item.siteLocation': 'Plan de încadrare în zonă',
  'pac.item.situationExisting': 'Plan de situație, situația actuală',
  'pac.item.situationProposed': 'Plan de situație, situația propusă',
  'pac.item.plans': 'Planurile tuturor nivelurilor, cu funcțiunea fiecărui spațiu',
  'pac.item.roof': 'Plan acoperiș și terase',
  'pac.item.facades': 'Fațade',
  'pac.item.sections': 'Secțiuni principale, cu profilul terenului',
  'pac.item.context': 'Documentație grafică și fotografică: vecinătăți, peisaj, impact vizual',
  'pac.item.utilities': 'Plan privind construcțiile subterane (branșamente și racorduri pe domeniul public)',
  'pac.item.engineeringDrawings': 'Piese desenate de inginerie la nivel de principiu (structură, instalații)',
  'pac.item.architectureMemo': 'Memoriu tehnic de arhitectură',
  'pac.item.specialtyMemos': 'Memorii tehnice de specialitate',
  'pac.item.neighbourExpertise': 'Expertiză tehnică privind influența asupra vecinătăților',
  'pac.item.geotechnical': 'Documentație geotehnică verificată',
  'pac.item.calculationBrief': 'Breviar de calcul (clase de consecințe CC3 și CC4)',
  'pac.item.diagnosis': 'Analiză diagnostic a clădirii existente',
  'pac.item.structuralExpertise': 'Evaluare/expertiză tehnică privind rezistența și stabilitatea',
  'pac.item.survey': 'Releveul detaliat al situației existente',
  'pac.opis.title': 'Opis: proiect pentru autorizarea construirii (PAC)',
  'pac.opis.law': 'Legea 169/2026, Anexa 2: conținutul proiectului pentru autorizarea construirii',
  'pac.opis.project': 'Proiect: {name}',
  'pac.opis.col.point': 'Anexa 2',
  'pac.opis.col.item': 'Piesă',
  'pac.opis.col.included': 'În acest fișier',
  'pac.opis.yes': 'Da',
  'pac.opis.no': 'Nu',
  'pac.opis.na': 'Nu este cazul',
  'pac.opis.sheets': 'Planșele din acest fișier, în ordinea setului',
  'pac.opis.col.page': 'Pagina',
  'pac.opis.col.sheet': 'Planșa',
};

export type PacWordKey = keyof typeof PAC_WORDS_EN;

/** The words of a language for the command line and the opis page: Romanian for `ro`, English otherwise. */
export function pacWordsFor(locale: string): Record<PacWordKey, string> {
  return /^ro\b/i.test(locale) ? PAC_WORDS_RO : PAC_WORDS_EN;
}
