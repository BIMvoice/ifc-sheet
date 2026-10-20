/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The Grid row of a view's Visibility / Graphics: on by default for a plan, a switch and a bubble-ends choice that land in the view. */

import '../../../test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render, click } from '../../../test/render.js';
import { addProjectView, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { ViewGraphicsDialog } from './ViewGraphicsDialog';

afterEach(cleanup);
beforeEach(() => useProjectStore.setState({ views: [] }));

function mount(): { view: () => ProjectView } {
  const id = addProjectView({ name: 'Level 0', kind: 'plan', level: { name: 'Level 0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 });
  const current = () => useProjectStore.getState().views.find((v) => v.id === id)!;
  // The navigator hands the dialog the store's current view; so does this host.
  const Host = () => <ViewGraphicsDialog view={useProjectStore((st) => st.views.find((v) => v.id === id)!)} open onOpenChange={() => {}} />;
  render(<Host />);
  return { view: current };
}

describe('the Grid row', () => {
  it('is on by default, switches off, and keeps the bubble ends the user picks', () => {
    const { view } = mount();
    const box = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]:not([aria-label])')!;
    assert.ok(box, 'a Grid switch');
    assert.equal(box.checked, true);
    const ends = document.body.querySelector<HTMLSelectElement>('select[aria-label="Grid bubbles"]')!;
    assert.equal(ends.value, 'both');
    act(() => {
      ends.value = 'start';
      ends.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.deepEqual(view().graphics?.grid, { ends: 'start' });
    click(box);
    assert.deepEqual(view().graphics?.grid, { ends: 'start', visible: false });
  });
});
