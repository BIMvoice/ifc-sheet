/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TagFieldsPanel } from '../TagFieldsPanel';
import type { DrawerSection } from './types';

/** Which IFC property feeds each field of a tag. */
export const tagFieldsSection: DrawerSection = { id: 'tag-fields', slot: 'body', order: 600, component: TagFieldsPanel };
