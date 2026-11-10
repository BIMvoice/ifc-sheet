/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's overhead range in its properties (#490): on by default, up to the floor above (the height field empty, its
 * hint saying so); a height of its own; switched off it is 0 and the height field is gone. A reflected plan has none.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { PlanProjectView, ProjectView } from '@/project/types';
import { ViewPropertiesPanel } from './ViewPropertiesPanel.js';

const PLAN: PlanProjectView = { id: 'p', name: 'Ground floor', createdAt: 0, kind: 'plan', level: { name: 'Ground floor', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const stored = () => useProjectStore.getState().views.find((v) => v.id === 'p') as PlanProjectView;

function mount(view: ProjectView): HTMLElement {
  resetProject();
  useProjectStore.setState({ views: [view] });
  return render(<ViewPropertiesPanel view={view} />);
}
const toggle = (ui: HTMLElement) => ui.querySelector<HTMLInputElement>('input[aria-label="Draw what is overhead"]');
const height = (ui: HTMLElement) => ui.querySelector<HTMLInputElement>('input[aria-label="Overhead height"]');

afterEach(() => cleanup());

describe('a plan\'s overhead range in its properties (#490)', () => {
  it('is on by default, up to the floor above', () => {
    const ui = mount(PLAN);
    assert.equal(toggle(ui)?.checked, true);
    assert.equal(height(ui)?.value, '');
    assert.equal(height(ui)?.placeholder, 'To the floor above');
  });

  it('switched off it stores 0 and leaves the height out; switched on again it is back to the floor above', () => {
    let ui = mount(PLAN);
    click(toggle(ui)!);
    assert.equal(stored().overheadHeight, 0);
    cleanup();
    ui = render(<ViewPropertiesPanel view={stored()} />);
    assert.equal(toggle(ui)?.checked, false);
    assert.equal(height(ui), null, 'no height while off');
    click(toggle(ui)!);
    assert.equal(stored().overheadHeight, null);
  });

  it('takes a height of its own, and an empty field is the floor above again', () => {
    const ui = mount(PLAN);
    type(height(ui)!, '2.5');
    blur(height(ui)!);
    assert.equal(stored().overheadHeight, 2.5);
    type(height(ui)!, '');
    blur(height(ui)!);
    assert.equal(stored().overheadHeight, null);
  });

  it('is not offered on a reflected ceiling plan', () => {
    const ui = mount({ ...PLAN, reflected: true });
    assert.equal(toggle(ui), null);
  });
});
