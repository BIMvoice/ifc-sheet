/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where the contrast tests look for Google Chrome before skipping (#103 review). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromePaths } from './render-harness';

test('a per-user Windows install under %LOCALAPPDATA% counts as installed, next to the Program Files ones', () => {
  const paths = chromePaths('win32', { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' });
  assert.deepEqual(paths, [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  ]);
  // Without LOCALAPPDATA there is no per-user root to look under, and no bogus relative path.
  assert.equal(chromePaths('win32', {}).length, 2);
});
