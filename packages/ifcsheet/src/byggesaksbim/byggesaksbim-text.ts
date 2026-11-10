/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of the ByggesaksBIM readiness findings, English. It imports nothing, so `readiness.ts` can spread it into
 * `READINESS_EN` and `READINESS_RO` (the app's catalogues spread those, so this is the one copy, and `ifcsheet check --locale ro`
 * prints it). Norwegian terms are kept where a Norwegian reader looks for them.
 */

/** One kind per requirement of `byggesaksbim.ids` (NO-H1 to NO-H7), and one for a model that lacks the element the requirement is read from. */
export type ByggesaksbimKind = 'byggesaksbimH1' | 'byggesaksbimH2' | 'byggesaksbimH3' | 'byggesaksbimH4' | 'byggesaksbimH5' | 'byggesaksbimH6' | 'byggesaksbimH7' | 'byggesaksbimNone' | 'byggesaksbimSchema' | 'byggesaksbimError';

const EFFECT = 'Required (Obligatorisk) in the DiBK P13 eByggesak report. This check is IfcSheet\'s own reading of that report, not DiBK\'s validator.';

export const BYGGESAKSBIM_EN = {
  'ready.byggesaksbimH1': 'Matrikkel number (IfcSite.LandTitleNumber) missing or in the wrong format on {count} of {total} sites: {list}. Format knr-gnr/bnr/fnr/snr, for example 0904-200/2430/0/14.',
  'ready.byggesaksbimH1.effect': EFFECT,
  'ready.byggesaksbimH2': 'BYA (built-up area, Pset_BuildingCommon.GrossPlannedArea) missing on {count} of {total} buildings: {list}.',
  'ready.byggesaksbimH2.effect': EFFECT,
  'ready.byggesaksbimH3': 'Building type (Pset_BuildingCommon.OccupancyType, a Geonorge code such as 111) missing on {count} of {total} buildings: {list}.',
  'ready.byggesaksbimH3.effect': EFFECT,
  'ready.byggesaksbimH4': 'BTA (gross area, Pset_BuildingStoreyCommon.GrossPlannedArea) missing on {count} of {total} storeys: {list}.',
  'ready.byggesaksbimH4.effect': EFFECT,
  'ready.byggesaksbimH5': 'BRA (usable area, Pset_BuildingStoreyCommon.NetPlannedArea) missing on {count} of {total} storeys: {list}.',
  'ready.byggesaksbimH5.effect': EFFECT,
  'ready.byggesaksbimH6': 'BRA (Pset_ZoneCommon.NetPlannedArea) missing on {count} of {total} bruksenhet zones: {list}.',
  'ready.byggesaksbimH6.effect': EFFECT,
  'ready.byggesaksbimH7': 'Lift type (IfcTransportElement.PredefinedType) missing on {count} of {total} lifts: {list}.',
  'ready.byggesaksbimH7.effect': EFFECT,
  'ready.byggesaksbimNone': 'The model has no {class}, which the ByggesaksBIM requirements are read from.',
  'ready.byggesaksbimNone.effect': EFFECT,
  'ready.byggesaksbimSchema': 'ByggesaksBIM requires IFC4; this model is {schema} and was not checked.',
  'ready.byggesaksbimSchema.effect': 'The requirements are written for IFC4 and read IFC4 property sets, so a model in another schema cannot be checked against them.',
  'ready.byggesaksbimError': 'The ByggesaksBIM check could not run: {reason}',
  'ready.byggesaksbimError.effect': 'Nothing was checked, so this is not a pass.',
} as const;

const EFFECT_RO = 'Obligatoriu (Obligatorisk) în raportul DiBK P13 eByggesak. Verificarea este interpretarea IfcSheet a raportului, nu validatorul DiBK.';

/** The same findings in Romanian (terms: `apps/viewer/src/i18n/ro-glossary.md`). */
export const BYGGESAKSBIM_RO: Record<keyof typeof BYGGESAKSBIM_EN, string> = {
  'ready.byggesaksbimH1': 'Numărul de matrikkel (IfcSite.LandTitleNumber) lipsește sau are formatul greșit la {count} din {total} amplasamente: {list}. Format knr-gnr/bnr/fnr/snr, de exemplu 0904-200/2430/0/14.',
  'ready.byggesaksbimH1.effect': EFFECT_RO,
  'ready.byggesaksbimH2': 'BYA (suprafața construită, Pset_BuildingCommon.GrossPlannedArea) lipsește la {count} din {total} clădiri: {list}.',
  'ready.byggesaksbimH2.effect': EFFECT_RO,
  'ready.byggesaksbimH3': 'Tipul clădirii (Pset_BuildingCommon.OccupancyType, un cod Geonorge precum 111) lipsește la {count} din {total} clădiri: {list}.',
  'ready.byggesaksbimH3.effect': EFFECT_RO,
  'ready.byggesaksbimH4': 'BTA (suprafața brută, Pset_BuildingStoreyCommon.GrossPlannedArea) lipsește la {count} din {total} niveluri: {list}.',
  'ready.byggesaksbimH4.effect': EFFECT_RO,
  'ready.byggesaksbimH5': 'BRA (suprafața utilă, Pset_BuildingStoreyCommon.NetPlannedArea) lipsește la {count} din {total} niveluri: {list}.',
  'ready.byggesaksbimH5.effect': EFFECT_RO,
  'ready.byggesaksbimH6': 'BRA (Pset_ZoneCommon.NetPlannedArea) lipsește la {count} din {total} zone bruksenhet: {list}.',
  'ready.byggesaksbimH6.effect': EFFECT_RO,
  'ready.byggesaksbimH7': 'Tipul liftului (IfcTransportElement.PredefinedType) lipsește la {count} din {total} lifturi: {list}.',
  'ready.byggesaksbimH7.effect': EFFECT_RO,
  'ready.byggesaksbimNone': 'Modelul nu are niciun {class}, din care se citesc cerințele ByggesaksBIM.',
  'ready.byggesaksbimNone.effect': EFFECT_RO,
  'ready.byggesaksbimSchema': 'ByggesaksBIM cere IFC4; acest model este {schema} și nu a fost verificat.',
  'ready.byggesaksbimSchema.effect': 'Cerințele sunt scrise pentru IFC4 și citesc seturi de proprietăți IFC4, deci un model în altă schemă nu poate fi verificat.',
  'ready.byggesaksbimError': 'Verificarea ByggesaksBIM nu a putut rula: {reason}',
  'ready.byggesaksbimError.effect': 'Nu s-a verificat nimic, deci nu înseamnă că totul e în regulă.',
};
