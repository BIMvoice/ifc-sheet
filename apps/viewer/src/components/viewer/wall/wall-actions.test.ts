/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The wheel on the Wall: a notch moves a plan's cut by 5 cm within the
 * offered range, and a section's depth by half a metre, an automatic depth
 * starting from 5 m.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { CUT_HEIGHT_RANGE, nudgeCutHeight, nudgeViewDepth, setCutHeight } from './wall-actions.js';

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const section: ProjectView = { id: 's', kind: 'section', name: 'Section A-A', createdAt: 0, plane: { axis: 'front', offset: 0, flipped: false } };
const view = (id: string) => useProjectStore.getState().views.find((v) => v.id === id);

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ views: [plan, section] });
});

describe('cut height on the Wall', () => {
  it('steps by 5 cm a notch, up and down', () => {
    nudgeCutHeight('p', 1);
    nudgeCutHeight('p', 1);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.3);
    nudgeCutHeight('p', -4);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.1);
  });

  it('stays within the offered range and on its step', () => {
    setCutHeight('p', 9);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, CUT_HEIGHT_RANGE.max);
    setCutHeight('p', 1.234);
    assert.equal((view('p') as { cutHeight: number }).cutHeight, 1.25);
  });

  it('leaves a section\'s plane alone', () => {
    nudgeCutHeight('s', 1);
    assert.deepEqual(view('s'), section);
  });
});

describe('view depth on the Wall', () => {
  it('starts an automatic depth at 5 m and steps by half a metre', () => {
    nudgeViewDepth('s', 1);
    assert.equal(view('s')?.viewDepth, 5.5);
    nudgeViewDepth('s', -2);
    assert.equal(view('s')?.viewDepth, 4.5);
  });
});
