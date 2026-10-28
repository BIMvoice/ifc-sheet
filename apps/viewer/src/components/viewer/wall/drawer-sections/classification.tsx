/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ClassificationPanel } from '../ClassificationPanel';
import type { DrawerSection } from './types';

/** The office's classification mappings (#89). */
export const classificationSection: DrawerSection = { id: 'classification', slot: 'body', order: 700, component: ClassificationPanel };
