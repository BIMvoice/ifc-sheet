/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #342 (jsdom has no layout, so the classes are asserted; the measured rects are the Playwright spec's,
 * `tests/e2e/info-dialog-fit-342.e2e.spec.ts`): the Info dialog's box is bounded by the viewport, its
 * grid has one shrinkable column, and every tab panel wraps long words and scrolls inside itself.
 */
import '@/test/setup-dom.js';
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
(globalThis as unknown as { __BUILD_DATE__: string }).__BUILD_DATE__ = '2026-01-01T00:00:00.000Z';
(globalThis as unknown as { __PACKAGE_VERSIONS__: Array<{ name: string; version: string }> }).__PACKAGE_VERSIONS__ = [];
(globalThis as unknown as { __RELEASE_HISTORY__: unknown[] }).__RELEASE_HISTORY__ = [];
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog.js';
import { INFO_DIALOG, INFO_PANEL } from './keyboard-dialog-layout';

afterEach(() => cleanup());

const tokens = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('the Info dialog fits its box (#342)', () => {
  it('the box is bounded by the viewport and has one shrinkable column, not a fixed width', () => {
    render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab="shortcuts" />);
    const box = document.querySelector('[role=dialog]');
    for (const t of INFO_DIALOG.split(' ')) assert.ok(tokens(box).includes(t), `the box has ${t}`);
    assert.ok(tokens(box).includes('max-w-[min(28rem,calc(100vw-2rem))]'), 'wider than the viewport is never asked for');
    assert.ok(tokens(box).includes('max-h-[calc(100dvh-2rem)]'));
    assert.ok(tokens(box).includes('grid-cols-[minmax(0,1fr)]'), 'the grid column can shrink below its content');
    assert.ok(!tokens(box).includes('max-w-md'), 'no fixed width');
  });

  it('every tab panel shrinks, wraps and scrolls inside itself', () => {
    for (const t of ['min-w-0', 'break-words', 'overflow-y-auto', 'overflow-x-hidden']) assert.ok(INFO_PANEL.split(' ').includes(t), t);
    for (const tab of ['about', 'whatsnew', 'shortcuts', 'learn'] as const) {
      render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab={tab} />);
      const panel = document.querySelector('[role=tabpanel]');
      for (const t of INFO_PANEL.split(' ')) assert.ok(tokens(panel).includes(t), `${tab} panel has ${t}`);
      assert.ok(tokens(panel).some((t) => /^max-h-/.test(t)), `${tab} panel is height-bounded`);
      cleanup();
    }
  });
});
