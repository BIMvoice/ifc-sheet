/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `shared-commands` (#526). Term choices: `../ro-glossary.md`. */
export const sharedCommandsRo = {
  'workspacePanels.bottom.charts': 'Diagrame',
  'workspacePanels.bottom.gantt': 'Grafic de execuție (Gantt)',
  'workspacePanels.panel.collab': 'Cameră de colaborare',
  'workspacePanels.panel.layers': 'Stivă de straturi',
  'workspacePanels.panel.presentation': 'Prezentare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
