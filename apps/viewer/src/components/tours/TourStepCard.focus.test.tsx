/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An anchored step card is `invisible` until floating-ui has placed it, and a
 * browser will not focus an invisible element. The card must take focus once
 * it is placed, not only when the step changes (while it was still hidden).
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, waitFor } from '@/test/render.js';
import { getTour } from '@/lib/tours/registry';
import { useTourStore } from '@/lib/tours/tour-store';
import { TourStepCard } from './TourStepCard.js';

afterEach(() => {
  cleanup();
  useTourStore.setState({ hintVisible: false, gateBroken: false });
});

describe('TourStepCard focus on an anchored step', () => {
  it('focuses the card once it is placed, though it was invisible when the step began', async () => {
    const proto = window.HTMLElement.prototype;
    const { focus } = proto;
    // As a browser does: an element hidden by `visibility` refuses focus.
    proto.focus = function (this: HTMLElement, options?: FocusOptions) {
      if (this.classList.contains('invisible')) return;
      focus.call(this, options);
    };
    try {
      const target = document.createElement('button');
      target.textContent = 'anchor';
      document.body.appendChild(target);
      const tour = getTour('welcome')!;
      const stepIndex = tour.steps.findIndex((s) => s.kind !== 'canvas');
      assert.ok(stepIndex >= 0, 'an anchored step to show');
      const ui = render(<TourStepCard tour={tour} step={tour.steps[stepIndex]} stepIndex={stepIndex} targetEl={target} />);
      const card = ui.querySelector<HTMLElement>('[role="dialog"]');
      assert.ok(card);
      await waitFor(() => !card.classList.contains('invisible'), 'the card is placed');
      await waitFor(() => document.activeElement === card, 'the placed card has focus');
      target.remove();
    } finally {
      proto.focus = focus;
    }
  });
});
