/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { useWhatChanged } from '@/whatchanged/baseline';
import type { SheetChanges } from '@/whatchanged/report';
import { useWallNav } from '../wall/wall-nav.js';
import { WhatChangedPanel } from './WhatChangedPanel.js';

const sheet = (id: string, number: string, name: string, count: number): SheetChanges => ({ sheetId: id, number, name, views: [], annotations: [], count });

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  useWhatChanged.setState({ running: false, message: 'Compared with the reference model: 4 elements changed in the model.', result: { changed: 4, unread: 0, clouds: 5, sheets: [sheet('s1', 'A-101', 'Ground floor', 3), sheet('s2', 'A-201', 'Elevations', 1), sheet('s3', 'A-301', 'Sections', 0)] } });
});
afterEach(() => { cleanup(); useWhatChanged.setState({ result: null, message: null }); });

const buttons = (ui: HTMLElement) => [...ui.querySelectorAll('button')];

describe('WhatChangedPanel', () => {
  it('lists each sheet that shows something that changed, with its count, and says how many are unchanged', () => {
    const ui = render(<WhatChangedPanel onClose={() => {}} />);
    const rows = buttons(ui).map((b) => b.textContent ?? '');
    assert.ok(rows.some((r) => r.startsWith('A-101: 3 changes')), rows.join(' | '));
    assert.ok(rows.some((r) => r.startsWith('A-201: 1 change') && !r.startsWith('A-201: 1 changes')), rows.join(' | '));
    assert.ok(!rows.some((r) => r.startsWith('A-301')));
    assert.match(ui.textContent ?? '', /1 sheet unchanged/);
  });
  it('steps into a sheet on click and closes', () => {
    let closed = 0;
    const ui = render(<WhatChangedPanel onClose={() => { closed++; }} />);
    click(buttons(ui).find((b) => b.textContent?.startsWith('A-101'))!);
    assert.equal(useWallNav.getState().stepped, 's1');
    assert.equal(closed, 1);
  });
  it('offers to clear the clouds while there are some, and to take the model as the reference only when the project has one', () => {
    const ui = render(<WhatChangedPanel onClose={() => {}} />);
    const clear = buttons(ui).find((b) => b.textContent === 'Clear the clouds')!;
    const accept = buttons(ui).find((b) => b.textContent === 'Use this model as the reference')!;
    assert.equal(clear.disabled, false);
    assert.equal(accept.disabled, true, 'no reference recorded');
  });
});
