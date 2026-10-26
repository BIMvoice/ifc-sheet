/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words of the ByggesaksBIM readiness findings, English. It imports nothing, so `readiness.ts` can spread it into
 * `READINESS_EN` (the app's English catalogue spreads that, so this is the one copy). The Romanian is the app's
 * (`apps/viewer/src/i18n/catalogues/byggesaksbim.ro.ts`). Norwegian terms are kept where a Norwegian reader looks for them.
 */

/** One kind per requirement of `byggesaksbim.ids` (NO-H1 to NO-H8), and one for a model that lacks the element the requirement is read from. */
export type ByggesaksbimKind = 'byggesaksbimH1' | 'byggesaksbimH2' | 'byggesaksbimH3' | 'byggesaksbimH4' | 'byggesaksbimH5' | 'byggesaksbimH6' | 'byggesaksbimH7' | 'byggesaksbimH8' | 'byggesaksbimNone';

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
  'ready.byggesaksbimH6': '{count} of {total} zones do not have Pset_ZoneCommon.Reference = "Bruksenhet": {list}.',
  'ready.byggesaksbimH6.effect': EFFECT,
  'ready.byggesaksbimH7': 'BRA (Pset_ZoneCommon.NetPlannedArea) missing on {count} of {total} bruksenhet zones: {list}.',
  'ready.byggesaksbimH7.effect': EFFECT,
  'ready.byggesaksbimH8': 'Lift type (IfcTransportElement.PredefinedType) missing on {count} of {total} lifts: {list}.',
  'ready.byggesaksbimH8.effect': EFFECT,
  'ready.byggesaksbimNone': 'The model has no {class}, which the ByggesaksBIM requirements are read from.',
  'ready.byggesaksbimNone.effect': EFFECT,
} as const;
