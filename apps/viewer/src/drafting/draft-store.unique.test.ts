/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import { assertUnique } from '@/test/assert-unique';
import { LIST_FIELDS, STEP_FIELDS } from './draft-store';

// #563: `STEP_FIELDS` is the frozen list plus the fields that opt in, so a field named in both must not be undone twice.
describe('the undo field lists name each key once', () => {
  it('STEP_FIELDS', () => assertUnique('STEP_FIELDS', STEP_FIELDS));
  it('LIST_FIELDS', () => assertUnique('LIST_FIELDS', LIST_FIELDS));
});
