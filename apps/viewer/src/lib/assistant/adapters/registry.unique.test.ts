/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import { assertUnique } from '@/test/assert-unique';
import { ASSISTANT_SOURCES } from '../sources';
import { ADAPTERS, ADAPTER_GROUPS } from './registry';

// #563: two PRs adding an adapter can merge cleanly with the same id listed twice; `adapterFor` would then keep only the last.
describe('the evidence adapter registry lists each id once', () => {
  it('adapters', () => assertUnique('ADAPTERS', ADAPTERS.map((a) => a.id)));
  it('adapter groups', () => assertUnique('ADAPTER_GROUPS', ADAPTER_GROUPS.map((g) => g.id)));
  it('assistant sources', () => assertUnique('ASSISTANT_SOURCES', ASSISTANT_SOURCES));
});
