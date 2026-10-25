/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CommentsSection } from '../CommentsSection';
import type { DrawerSection } from './types';

/** The review comments of the project, newest first. */
export const commentsSection: DrawerSection = { id: 'comments', slot: 'top', order: 200, component: ({ go }) => <CommentsSection onGo={go} /> };
