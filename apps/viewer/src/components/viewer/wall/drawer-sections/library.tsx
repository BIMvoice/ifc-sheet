/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LibraryPanel } from '../LibraryPanel';
import type { DrawerSection } from './types';

/** The library file: import and export of the office's templates, types and catalogues. */
export const librarySection: DrawerSection = { id: 'library', slot: 'top', order: 100, component: LibraryPanel };
