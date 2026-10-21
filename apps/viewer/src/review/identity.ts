/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Who is writing: the name the reviewer gave and the browser remembered, else
 * the viewer's own identity (the one collaboration shows), else nobody.
 */

import { useViewerStore } from '@/store';
import { rememberedAuthor } from './author';

export function reviewerName(): string {
  return rememberedAuthor() || useViewerStore.getState().collabIdentity?.name || '';
}
