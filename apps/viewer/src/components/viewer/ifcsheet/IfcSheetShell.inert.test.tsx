/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #295: the engine's interface stays mounted under the IfcSheet face for its drawing runtime, so while anything
 * covers the viewport (`viewport-cover`: the face, or another cover) it must take no focus and be read by nobody.
 */

import '@/test/setup-dom.js';
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup } from '@/test/render.js';
import { renderViewerLayout } from '@/test/viewer-layout-harness.js';
import { setEditionForTests } from '@/edition';
import { useViewerStore } from '@/store';
import { coverViewport } from '../viewport-cover.js';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';

/** Focusables under `root` that Tab could reach: not disabled, not tabindex -1, no inert ancestor, not aria-hidden. */
function reachable(root: Element): Element[] {
  return [...root.querySelectorAll(FOCUSABLE)].filter((e) => !(e as HTMLButtonElement).disabled
    && e.getAttribute('tabindex') !== '-1' && !e.closest('[inert]') && !e.closest('[aria-hidden="true"]'));
}

beforeEach(() => {
  useViewerStore.setState({ isMobile: false });
});
afterEach(() => {
  cleanup();
  setEditionForTests(null);
});

describe('the engine under the IfcSheet face is inert (#295)', () => {
  it('leaves no focusable element in the covered engine subtree reachable by Tab', () => {
    setEditionForTests('docs');
    const ui = renderViewerLayout();
    const engine = ui.querySelector('[data-engine-root]');
    assert.ok(engine, 'the engine subtree is marked');
    assert.ok(ui.querySelector('[data-ifcsheet-shell]'), 'the face is up');
    assert.ok(engine.querySelectorAll(FOCUSABLE).length > 5, 'the engine really has controls (the count below is not vacuous)');
    assert.equal(reachable(engine).length, 0, 'no covered control can take focus');
    assert.ok(engine.closest('[inert]') ?? engine.hasAttribute('inert'));
  });

  it('keeps the face itself reachable', () => {
    setEditionForTests('docs');
    const ui = renderViewerLayout();
    const shell = ui.querySelector('[data-ifcsheet-shell]');
    assert.ok(shell);
    assert.ok(reachable(shell).length > 0);
  });

  it('is not inert without a cover (the full edition), and is while another cover is held', () => {
    setEditionForTests('full');
    const ui = renderViewerLayout();
    const engine = ui.querySelector('[data-engine-root]');
    assert.ok(engine);
    assert.ok(reachable(engine).length > 5, 'uncovered: the ribbon takes focus');
    let lift = (): void => {};
    act(() => { lift = coverViewport(); });
    assert.equal(reachable(engine).length, 0, 'covered: nothing does');
    act(() => { lift(); });
    assert.ok(reachable(engine).length > 5, 'cover lifted: the ribbon takes focus again');
  });
});
