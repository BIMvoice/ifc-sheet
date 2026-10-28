/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the room and area schedule (#42), with the terms of `../ro-glossary.md`: încăpere, arie, arie utilă (Au), nivel. */
export const roomScheduleRo = {
  'roomSched.newName': 'Tabel de încăperi și arii',
  'roomSched.add': '+ Tabel de încăperi și arii',
  'roomSched.number': 'Nr.',
  'roomSched.room': 'Încăpere',
  'roomSched.area': 'Arie utilă m²',
  'roomSched.levelTotal': 'Total {level}',
  'roomSched.total': 'Total clădire (Au)',
  'roomSched.noLevel': 'Fără nivel',
  'roomSched.empty': 'Modelele încărcate nu au încăperi (IfcSpace).',
  'roomSched.note.source': 'Aria: NetFloorArea din model, în lipsa ei GrossFloorArea (Qto_SpaceBaseQuantities, altfel orice set de cantități). Totalul clădirii este Au din foaia de indicatori urbanistici: aceleași încăperi, aceleași arii.',
  'roomSched.note.geometry': '* Arie estimată: modelul nu dă NetFloorArea sau GrossFloorArea pentru această încăpere, deci se ia aria amprentei geometriei ei ({count} încăperi).',
  'roomSched.note.none': '{count} încăperi nu au arie (modelul nu o dă și nu au geometrie); sunt listate și nu intră în totaluri.',
  'roomSched.note.leftOut': 'Excluse: {external} exterioare (balcoane, terase), {gfa} din schema de arii (GFA), {parents} împărțite în încăperi proprii.',
  'ready.estimatedAreas.go': 'Mergi la prima încăpere',
  'urban.rule.auEstimated': 'Au include {count} încăperi a căror arie nu este dată de model: sunt măsurate din geometrie (≈ {area} m², {share} % din Au) și pot fi greșite sub plafoane înclinate: {list}.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
