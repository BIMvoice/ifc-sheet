/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `several catalogues` (#526). Term choices: `../ro-glossary.md`. */
export const miscReachableRo = {
  'chartComparison.missing': 'Comparația salvată nu este disponibilă în acest browser. Alegeți altă comparație salvată; ultima rulare nu este înlocuită.',
  'chartComparison.recorded': 'Comparație salvată: {name}. Rânduri de raport înregistrate; selecția 3D și instantaneele nu sunt disponibile.',
  'drawingUnderlay.dxf.explicitUnitsRequired': '„{name}” nu are o declarație de unități DXF cunoscută. Alegeți unitățile, apoi importați-l din nou.',
  'editMode.autoOn': 'Modul de editare este pornit: uneltele de proiectare modifică modelul. Opriți-l din Autor › Model.',
  'measure.polyline.basisLength': 'Lungime',
  'measure.polyline.basisPerimeterClosed': 'Perimetru (închis)',
  'project.file.tooNew': 'Acest proiect a fost salvat de o versiune mai nouă a IfcSheet (versiunea fișierului {found}; această versiune deschide până la {supported}). Actualizați IfcSheet pentru a-l deschide. Nu s-a deschis nimic.',
  'projectNavigator.error.import': 'Fișierul de proiect nu a putut fi deschis: {detail}',
  'validationPanel.history.models': 'Modele: {models}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
