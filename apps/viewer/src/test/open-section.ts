/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Open a section of the Wall's viewport card (#290) from a test: the heading button whose title is `title`. A section that is
 * open already is left open, so a test does not depend on which sections the card opens by default.
 */

import assert from 'node:assert/strict';
import { click } from './render.js';

/** The heading button of the section titled `title`. */
export function sectionHeading(root: ParentNode, title: string): HTMLButtonElement {
  const heading = [...root.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => (b.textContent ?? '').replace(/^▸/, '').startsWith(title));
  assert.ok(heading, `the card has a "${title}" section`);
  return heading;
}

/** Open the section titled `title` (no-op when it is open); returns its heading. */
export function openSection(root: ParentNode, title: string): HTMLButtonElement {
  const heading = sectionHeading(root, title);
  if (heading.getAttribute('aria-expanded') !== 'true') click(heading);
  assert.equal(heading.getAttribute('aria-expanded'), 'true', `"${title}" opened`);
  return heading;
}
