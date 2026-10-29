/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `several catalogues` (#526). Term choices: `../ro-glossary.md`. */
export const panelTitlesRo = {
  'appearance.panelView.heading': 'Aspect',
  'assistant.title': 'Asistent',
  'bcf.panel.title': 'Subiecte BCF',
  'changeSets.panel.title': 'Seturi de modificări',
  'clashPanel.title': 'Detectarea coliziunilor',
  'comparePanel.panel.title': 'Compararea modelelor',
  'costPanel.title': 'Costuri',
  'extensionsFlavors.extensionsPanel.heading': 'Extensii',
  'flowPanel.title': 'Flux',
  'lensPanel.title': 'Lentilă',
  'modelInspector.panel.title': 'Inspectorul de model',
  'placementPanel.title': 'Amplasare',
  'scriptPanel.header.defaultTitle': 'Editor de scripturi',
  'semantic.title': 'Înregistrări legate',
  'sources.sourcesPanel.title': 'Surse în cloud',
  'validationPanel.title': 'Validarea datelor',
  'zonesPanel.header.title': 'Zone de amplasare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
