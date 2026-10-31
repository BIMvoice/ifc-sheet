/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Many tests here open a real model and build a whole set; on a loaded CI runner that takes longer than vitest's 5 s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
