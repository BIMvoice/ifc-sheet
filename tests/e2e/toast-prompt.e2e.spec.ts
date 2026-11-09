/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// e2e-lane: viewer-e2e

/**
 * The first-run privacy toast stays until it is dismissed, and it sat over the command line at the bottom of an open
 * sheet, cutting the running tool's prompt ("Specify dimension line location (ALIGN toggles snapping to other dime").
 * Positions are measured in a real browser: the component tests run in happy-dom, which has no layout.
 */

import { test, expect } from '@playwright/test';
import { openDemoSheet } from './wall-demo.helpers';

test('the privacy toast does not cover the prompt of the running tool, and stays until dismissed', async ({ page }) => {
  test.setTimeout(240000);
  await openDemoSheet(page);
  const toast = page.locator('[data-toast-seq]').filter({ hasText: /action log/ });
  await expect(toast).toBeVisible({ timeout: 30000 });
  // Draw in the first plan, then start the Dimension tool: it asks for its points on the command line.
  await page.mouse.dblclick(560, 400);
  await page.getByRole('button', { name: 'Dimension', exact: true }).click();
  await page.mouse.click(372, 300);
  const prompt = page.locator('[data-tool-prompt]');
  await expect(prompt).toBeVisible({ timeout: 30000 });
  const [t, p] = await Promise.all([toast.boundingBox(), prompt.boundingBox()]);
  if (!t || !p) throw new Error('the toast or the prompt line has no box');
  const overlap = Math.min(t.x + t.width, p.x + p.width) > Math.max(t.x, p.x) && Math.min(t.y + t.height, p.y + p.height) > Math.max(t.y, p.y);
  expect(overlap, `toast ${JSON.stringify(t)} covers the prompt line ${JSON.stringify(p)}`).toBe(false);
  // By design it stays: nothing the tool does takes it away.
  await expect(toast).toBeVisible();
  if (process.env.TOAST_SHOT) await page.screenshot({ path: process.env.TOAST_SHOT });
  // And it is clear of the header, whose controls must stay clickable.
  const header = await page.locator('[data-ifcsheet-shell] > header').boundingBox();
  expect(header && t.y >= header.y + header.height).toBe(true);
});
