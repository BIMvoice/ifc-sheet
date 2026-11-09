/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// e2e-lane: viewer-e2e

/**
 * An open sheet shows its whole paper beside the card, not under it. At 1400x900 the card on the right ("Place on this
 * sheet") covered the right plan and the title block of A-101, because Fit fitted the paper into the whole canvas.
 * Layout is measured in a real browser: the component tests run in happy-dom, which has no layout.
 */

import { test, expect, type Page } from '@playwright/test';
import { openDemoSheet } from './wall-demo.helpers';

interface Box { left: number; right: number; top: number; bottom: number }

async function boxes(page: Page): Promise<{ card: Box; paper: Box; titleBlock: Box }> {
  return page.evaluate(() => {
    const rect = (e: Element | null, what: string): Box => {
      if (!e) throw new Error(`${what} is not on screen`);
      const b = e.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const card = document.querySelector('[data-wall-card-host]')?.firstElementChild ?? null;
    return { card: rect(card, 'the card'), paper: rect(document.querySelector('[data-sheet-id]'), 'the paper'), titleBlock: rect(document.querySelector('[data-title-block]'), 'the title block') };
  });
}

function apart(a: Box, b: Box): boolean {
  return a.right <= b.left + 1 || a.left >= b.right - 1 || a.bottom <= b.top + 1 || a.top >= b.bottom - 1;
}

async function expectClear(page: Page, when: string): Promise<void> {
  const { card, paper, titleBlock } = await boxes(page);
  expect(apart(paper, card), `${when}: the paper ${JSON.stringify(paper)} runs under the card ${JSON.stringify(card)}`).toBe(true);
  expect(apart(titleBlock, card), `${when}: the title block ${JSON.stringify(titleBlock)} is under the card`).toBe(true);
}

test('the paper and its title block clear the card on arrival at 1400x900 and after Fit at 1280x800, 1400x900 and 1920x1080', async ({ page }) => {
  test.setTimeout(480000);
  await openDemoSheet(page);
  await expectClear(page, 'on arrival at 1400x900');
  if (process.env.FIT_CARD_SHOT) await page.screenshot({ path: process.env.FIT_CARD_SHOT });
  for (const [width, height] of [[1280, 800], [1400, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: /^Fit/ }).first().click();
    await page.waitForTimeout(300);
    await expectClear(page, `after Fit at ${width}x${height}`);
    if (process.env.FIT_CARD_SHOT) await page.screenshot({ path: process.env.FIT_CARD_SHOT.replace('.png', `-${width}.png`) });
  }
});
