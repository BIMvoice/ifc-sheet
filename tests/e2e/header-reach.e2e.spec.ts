/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// e2e-lane: viewer-e2e

/**
 * IfcSheet's header keeps every control inside the window. At 1400 px wide Feedback, Tour and "?" sat past the right
 * edge (right edges 1426, 1486 and 1526), where nobody could click them. Layout is measured in a real browser: the
 * component tests run in happy-dom, which has no layout.
 */

import { test, expect, type Page } from '@playwright/test';
import { openDemoSheet } from './wall-demo.helpers';

/** Every control in the header that is visible, with the right edge of its box. */
async function headerControls(page: Page): Promise<{ name: string; right: number; left: number }[]> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-ifcsheet-shell] > header');
    if (!header) throw new Error('the IfcSheet header is not on screen');
    return [...header.querySelectorAll('button, a, select, input')]
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const box = e.getBoundingClientRect();
        return { name: (e.getAttribute('aria-label') ?? e.textContent ?? e.tagName).trim(), right: Math.round(box.right), left: Math.round(box.left) };
      });
  });
}

for (const width of [1280, 1400]) {
  test(`every header control is inside a ${width} px wide window and can be clicked`, async ({ page }) => {
    test.setTimeout(240000);
    await openDemoSheet(page);
    await page.setViewportSize({ width, height: 900 });
    const controls = await headerControls(page);
    expect(controls.length).toBeGreaterThan(8);
    for (const c of controls) {
      expect(c.right, `"${c.name}" ends at ${c.right}, past the ${width} px window`).toBeLessThanOrEqual(width);
      expect(c.left, `"${c.name}" starts left of the window`).toBeGreaterThanOrEqual(0);
    }
    const rows = await page.locator('[data-ifcsheet-shell] > header').evaluate((h) => h.getBoundingClientRect().height);
    expect(rows, 'the header stays one row').toBeLessThanOrEqual(49);
    for (const name of ['Feedback', 'Tour']) {
      const button = page.locator('[data-ifcsheet-shell] > header').getByRole('button', { name }).first();
      await expect(button, `${name} is in the header`).toBeVisible();
      const box = await button.boundingBox();
      expect(box && box.x + box.width).toBeLessThanOrEqual(width);
    }
  });
}
