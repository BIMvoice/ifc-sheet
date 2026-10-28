/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian (#258) for the tables a sheet prints and the settings that feed them: the site plan's territorial balance, the urban indicators sheet (Ac, Ad, Au, POT, CUT), the finishes and type-quantity schedules, the legend's own words, the civil profile's bands and the register's empty state. Term choices: `../ro-glossary.md`.
 * ±0,00 is written with the decimal comma, as on a Romanian drawing; the quantities themselves are formatted by the code.
 */
export const sheetTablesRo = {
  // Site plan: the territorial balance ("bilanț teritorial") and the coordinates under the plot.
  'site.balance.title': 'Bilanț teritorial',
  'site.balance.plot': 'Suprafața terenului',
  'site.balance.noPlot': 'limita terenului nu este desenată',
  'site.balance.built': 'Aria construită (Ac)',
  'site.balance.gross': 'Aria desfășurată (Ad)',
  'site.balance.grossForCut': 'Ad pentru CUT',
  'site.balance.pot': 'POT (Ac / suprafața terenului)',
  'site.balance.cut': 'CUT (Ad pentru CUT / suprafața terenului)',
  'site.balance.area': '{value} m²',
  'site.balance.percent': '{value} %',
  'site.coordinates.e': 'E {value}',
  'site.coordinates.n': 'N {value}',
  'site.coordinates.x': 'X {value} (local)',
  'site.coordinates.y': 'Y {value} (local)',

  // Urban indicators sheet (A-601): the tables.
  'urban.level': 'Nivel',
  'urban.elevation': 'Cota m',
  'urban.built': 'Arie construită m²',
  'urban.useful': 'Arie utilă m²',
  'urban.inCut': 'În CUT',
  'urban.yes': 'da',
  'urban.no': 'nu',
  'urban.category': 'Categoria încăperii',
  'urban.area': 'Arie m²',
  'urban.ac': 'Ac (aria construită)',
  'urban.ad': 'Ad (aria desfășurată, toate nivelurile)',
  'urban.adCut': 'Ad pentru CUT',
  'urban.au': 'Au (aria utilă)',
  'urban.site': 'Suprafața terenului',
  'urban.pot': 'POT (Ac / teren)',
  'urban.cut': 'CUT (Ad pentru CUT / teren)',
  'urban.atLeast': '≥ {value}',
  'urban.belowGround': '{name} (subsol)',
  'urban.ground': '{name} (Ac la {mark})',

  // Urban indicators sheet: the notes printed under the tables.
  'urban.rule.areas': 'Ac: aria construită la {mark}, pe {level}. Ad: ariile construite ale tuturor nivelurilor, inclusiv subsolurile (STAS 4908-85).',
  'urban.rule.au': 'Au: toate încăperile (IfcSpace). Excluse: {external} exterioare (balcoane, terase), {gfa} din schema de arii (GFA), {parents} împărțite în încăperi proprii.',
  'urban.rule.cut': 'Ad pentru CUT exclude: {levels}. Legea 350/2001 nu include subsolurile cu înălțimea liberă de cel mult {limit} m sau folosite numai pentru parcare, încăperi tehnice ori protecție civilă. Implicit, un subsol de cel mult {limit} m între pardoseli este exclus; alegerea se face pe fiecare nivel.',
  'urban.rule.cutNone': 'niciunul',
  'urban.rule.ground': 'Subsol: mai mult de jumătate din înălțimea nivelului se află sub teren, la {terrain}. {mark} este cota {zero} a modelului ({source}).',
  'urban.rule.zero.assumed': 'negăsită în model: luată la cel mai de jos nivel, introduceți-o dacă este greșită',
  'urban.rule.zero.building': 'cota de referință a clădirii',
  'urban.rule.zero.model': 'din niveluri',
  'urban.rule.zero.user': 'introdusă',
  'urban.assumedInterior': 'Fără planșeu sau încăpere la {levels}: tot spațiul închis de acolo a fost socotit construit.',
  'urban.unmeasured': 'Ac/Ad pot fi subestimate: {count} element(e) de la {level} nu au putut fi măsurate.',
  'urban.siteSource.model': 'Suprafața terenului: aria IfcSite din model; pe planul de situație nu este desenată nicio limită a terenului.',
  'urban.siteSource.none': 'Pe planul de situație nu este desenată nicio limită a terenului și nu este dată nicio suprafață a terenului: POT și CUT nu se calculează.',
  'urban.siteSource.plot': 'Suprafața terenului: măsurată pe limita terenului desenată pe planul de situație. O suprafață introdusă în proiect o înlocuiește.',
  'urban.siteSource.typed': 'Suprafața terenului: introdusă în proiect. Înlocuiește limita terenului desenată pe planul de situație ({plot} m²).',
  'urban.siteSource.typedNoPlot': 'Suprafața terenului: introdusă în proiect; pe planul de situație nu este desenată nicio limită a terenului.',

  // Urban indicators: the settings beside the sheet.
  'urban.empty': 'Niciun nivel din modelele încărcate nu are pereți, stâlpi sau planșee de măsurat.',
  'urban.siteArea': 'Suprafața terenului (m²)',
  'urban.siteArea.fromModel': 'model: {area} m²',
  'urban.siteArea.fromPlot': 'limită desenată: {area} m²',
  'urban.siteArea.none': 'nicio limită desenată, nimic în model',
  'urban.siteArea.help': 'POT și CUT se măsoară față de ea. Dacă o introduceți, înlocuiește limita terenului desenată pe planul de situație. Lăsați gol pentru limita desenată, altfel se folosește suprafața terenului din model.',
  'urban.cutLevels': 'Ad pentru CUT include:',
  'urban.cutLevel.help': 'Debifați un nivel ca să-l excludeți din Ad pentru CUT (Legea 350/2001: subsoluri cu înălțimea liberă de până la 1,80 m sau folosite numai pentru parcare, încăperi tehnice ori protecție civilă).',
  'urban.terrain': 'Teren (m)',
  'urban.terrain.help': 'Cota terenului față de ±0,00; un nivel este subsol când mai mult de jumătate din înălțimea sa se află sub ea. Lăsați gol pentru ±0,00.',
  'urban.zero': '±0,00 la (m)',
  'urban.zero.help': 'Cota modelului pentru ±0,00. Lăsați gol ca să fie găsită din niveluri.',

  // Finishes schedule.
  'finishes.number': 'Nr.',
  'finishes.room': 'Încăpere',
  'finishes.level': 'Nivel',
  'finishes.floor': 'Pardoseală',
  'finishes.wall': 'Perete',
  'finishes.ceiling': 'Tavan',
  'finishes.area': 'Arie m²',
  'finishes.sharedNote': '* Un finisaj comun mai multor încăperi: aria lui se împarte egal între ele.',

  // Type quantities schedule.
  'typeQty.type': 'Tip',
  'typeQty.class': 'Clasă',
  'typeQty.level': 'Nivel',
  'typeQty.count': 'Număr',
  'typeQty.length': 'Lungime m',
  'typeQty.area': 'Arie m²',
  'typeQty.volume': 'Volum m³',
  'typeQty.noQto': 'Fără Qto',
  'typeQty.total': 'Total',
  'typeQty.noType': '(fără tip)',
  'typeQty.noLevel': 'Fără nivel',

  // Legend and drawing register.
  'legend.continued': '{heading} (continuare)',
  'legend.membrane': 'membrană',
  'legend.sampleText': 'Abc',
  'register.empty': 'Setul nu are încă nicio planșă.',
  'atype.tool.text': 'Text',
  'atype.tool.leader': 'Linie de indicație',
  'atype.tool.tag': 'Etichetă',
  'atype.tool.label': 'Etichetă parametrică',
  'atype.tool.dimaligned': 'Cotă aliniată',
  'atype.tool.dimlinear': 'Cotă liniară',
  'atype.tool.dimradius': 'Rază',
  'atype.tool.dimdiameter': 'Diametru',
  'atype.tool.dimangular': 'Unghi',
  'atype.tool.level': 'Cotă de nivel',
  'atype.tool.axis': 'Axă de grilă',
  'atype.tool.hatch': 'Hașură',

  // Civil profile and cross sections.
  'civilDwg.newProfile': '{name} — profil longitudinal',
  'civilDwg.newSections': '{name} — profile transversale',
  'civilDwg.noCorridor': 'Coridorul desenat aici nu se află în modelele încărcate',
  'civilDwg.band.station': 'Kilometraj',
  'civilDwg.band.ground': 'Teren',
  'civilDwg.band.grade': 'Proiect',
  'civilDwg.band.cutFill': 'Debleu / rambleu',
  'civilDwg.band.geometry': 'Traseu',
  'civilDwg.curve': 'L = {length} m',
  'civilDwg.radius': 'R = {radius}',
  'civilDwg.areas': 'Debleu {cut} m² · Rambleu {fill} m²',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
