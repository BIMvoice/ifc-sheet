/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Romanian for the ByggesaksBIM check (#372): the opt-in, the findings' sentences (the keys the engine's English has) and their one effect line. */
const EFFECT = 'Obligatoriu (Obligatorisk) în raportul DiBK P13 eByggesak. Verificarea este interpretarea IfcSheet a raportului, nu validatorul DiBK.';

export const byggesaksbimRo = {
  'ready.byggesaksbim.label': 'ByggesaksBIM (Norge)',
  'ready.byggesaksbim.hint': 'Verifică modelul față de cele șapte cerințe obligatorii (Obligatorisk) din raportul DiBK P13 eByggesak: număr matrikkel, BYA, tipul clădirii, BTA și BRA pe nivel, zone bruksenhet, tipul liftului. Ce nu respectă apare în listă. Oprit: nu se rulează nimic.',
  'ready.byggesaksbim.select': 'Selectează primul element',
  'ready.byggesaksbimH1': 'Numărul de matrikkel (IfcSite.LandTitleNumber) lipsește sau are formatul greșit la {count} din {total} amplasamente: {list}. Format knr-gnr/bnr/fnr/snr, de exemplu 0904-200/2430/0/14.',
  'ready.byggesaksbimH1.effect': EFFECT,
  'ready.byggesaksbimH2': 'BYA (suprafața construită, Pset_BuildingCommon.GrossPlannedArea) lipsește la {count} din {total} clădiri: {list}.',
  'ready.byggesaksbimH2.effect': EFFECT,
  'ready.byggesaksbimH3': 'Tipul clădirii (Pset_BuildingCommon.OccupancyType, un cod Geonorge precum 111) lipsește la {count} din {total} clădiri: {list}.',
  'ready.byggesaksbimH3.effect': EFFECT,
  'ready.byggesaksbimH4': 'BTA (suprafața brută, Pset_BuildingStoreyCommon.GrossPlannedArea) lipsește la {count} din {total} niveluri: {list}.',
  'ready.byggesaksbimH4.effect': EFFECT,
  'ready.byggesaksbimH5': 'BRA (suprafața utilă, Pset_BuildingStoreyCommon.NetPlannedArea) lipsește la {count} din {total} niveluri: {list}.',
  'ready.byggesaksbimH5.effect': EFFECT,
  'ready.byggesaksbimH6': 'BRA (Pset_ZoneCommon.NetPlannedArea) lipsește la {count} din {total} zone bruksenhet: {list}.',
  'ready.byggesaksbimH6.effect': EFFECT,
  'ready.byggesaksbimH7': 'Tipul liftului (IfcTransportElement.PredefinedType) lipsește la {count} din {total} lifturi: {list}.',
  'ready.byggesaksbimH7.effect': EFFECT,
  'ready.byggesaksbimNone': 'Modelul nu are niciun {class}, din care se citesc cerințele ByggesaksBIM.',
  'ready.byggesaksbimNone.effect': EFFECT,
  'ready.byggesaksbimSchema': 'ByggesaksBIM cere IFC4; acest model este {schema} și nu a fost verificat.',
  'ready.byggesaksbimSchema.effect': 'Cerințele sunt scrise pentru IFC4 și citesc seturi de proprietăți IFC4, deci un model în altă schemă nu poate fi verificat.',
  'ready.byggesaksbimError': 'Verificarea ByggesaksBIM nu a putut rula: {reason}',
  'ready.byggesaksbimError.effect': 'Nu s-a verificat nimic, deci nu înseamnă că totul e în regulă.',
} as const satisfies Record<string, TranslationValue>;
