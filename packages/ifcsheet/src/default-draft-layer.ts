/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { DraftLayer } from './draft-types.js';

/** The layer the drafted annotation is on when a set has none of its own: the app's layer "0". */
export const DEFAULT_DRAFT_LAYER: DraftLayer = { id: '0', name: '0', color: '#18181b', visible: true, locked: false };
