/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The Wall covers the 3D viewport while it is up, and lifts the cover when it goes (#154). */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { IfcSheetShell } from './IfcSheetShell.js';
import { isViewportCovered } from '../viewport-cover.js';

afterEach(cleanup);

describe('IfcSheetShell and the 3D viewport behind it', () => {
  it('covers the viewport while mounted and uncovers it when it goes', () => {
    assert.equal(isViewportCovered(), false);
    render(<IfcSheetShell />);
    assert.equal(isViewportCovered(), true);
    cleanup();
    assert.equal(isViewportCovered(), false);
  });
});
