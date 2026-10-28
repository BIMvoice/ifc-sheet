/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MaterialsSection } from '../MaterialsSection';
import type { DrawerSection } from './types';

/** The building materials of the loaded models: how each draws where a view cuts it (#90). */
export const materialsSection: DrawerSection = { id: 'materials', slot: 'body', order: 650, component: MaterialsSection };
