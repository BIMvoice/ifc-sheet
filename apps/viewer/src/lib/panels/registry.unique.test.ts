/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import { assertUnique } from '@/test/assert-unique';
import { PANEL_GROUPS, WORKSPACE_PANELS } from './registry.js';

// #563: two PRs adding a panel can merge cleanly with the same id listed twice.
describe('the panel registry lists each id once', () => {
  it('workspace panels', () => assertUnique('WORKSPACE_PANELS', WORKSPACE_PANELS.map((p) => p.id)));
  it('panel groups', () => assertUnique('PANEL_GROUPS', PANEL_GROUPS.map((g) => g.id)));
});
