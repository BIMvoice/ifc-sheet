/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The width of the sheet canvas that Fit may use. The card floats over the canvas's right side (`data-wall-card-host`
 * in SteppedSheet), so the paper is fitted into what it leaves free, never into less than half the canvas. The card is
 * found in the DOM, not through a ref: the canvas first fits before the card's ref is attached.
 */
export function fitWidth(canvas: HTMLElement): number {
  const full = canvas.getBoundingClientRect().width;
  const card = canvas.closest('main')?.querySelector(':scope > [data-wall-card-host]')?.firstElementChild;
  const covered = card ? card.getBoundingClientRect().width + 24 : 0;
  return full - Math.min(covered, full / 2);
}
