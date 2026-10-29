/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `mutation-permission` (#526). Term choices: `../ro-glossary.md`. */
export const mutationPermissionRo = {
  'mutationPermission.editModeRequired': 'Porniți modul de editare pentru a modifica acest model',
  'mutationPermission.modelLinked': 'Acesta este un model legat: este afișat pentru coordonare și nu poate fi editat',
  'mutationPermission.modelUnavailable': 'Acest model nu are date IFC editabile',
  'mutationPermission.roleRequired': 'Editarea cere acces de editor în această sesiune partajată',
  'mutationPermission.workflowRunning': 'Așteptați să se termine verificarea fluxului sau captura PDF, ori anulați fluxul',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
