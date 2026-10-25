/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ViewTemplatesPanel } from '../ViewTemplatesPanel';
import type { DrawerSection } from './types';

/** The project's view templates (#44). */
export const viewTemplatesSection: DrawerSection = { id: 'view-templates', slot: 'body', order: 800, component: ViewTemplatesPanel };
