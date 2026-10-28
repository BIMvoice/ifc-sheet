/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallCompareRo = {
  'wall.compare.pick': 'Compară {name} cu altă planșă',
  'wall.compare.picking': 'Alege acum planșa cu care se compară {name}.',
  'wall.compare.cancel': 'Renunță',
  'wall.compare.title': 'Compară două planșe',
  'wall.compare.left': 'Planșa din stânga',
  'wall.compare.right': 'Planșa din dreapta',
  'wall.compare.paneLeft': 'Planșa din stânga, {name}',
  'wall.compare.paneRight': 'Planșa din dreapta, {name}',
  'wall.compare.together': 'Deplasare împreună',
  'wall.compare.swap': 'Schimbă între ele cele două planșe',
  'wall.compare.close': 'Înapoi la panou (Esc)',
  'wall.compare.zoom': 'Zoom pentru ambele planșe',
} as const satisfies Record<string, TranslationValue>;
