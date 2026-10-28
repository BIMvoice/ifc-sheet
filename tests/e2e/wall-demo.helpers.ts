/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The demo project, stepped into its first sheet (A-101, two plans), for the Wall's e2e specs. */

import type { Locator, Page } from '@playwright/test';

export async function openDemoSheet(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip (use demo)' }).click({ timeout: 30000 });
  const hang = page.locator('[data-tour="wall-hang"]');
  await hang.waitFor({ timeout: 180000 });
  await hang.evaluate((e) => (e as HTMLElement).click());
  // The tour's cards sit over the sheets: skip them.
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /^Skip step$/ }).click({ timeout: 1500 }).catch(() => {});
  const sheet = page.getByText('A-101 Floor plans 1').first();
  await sheet.waitFor();
  // The paper is the card's picture above its caption.
  const box = await sheet.boundingBox();
  if (!box) throw new Error('A-101 is not on the wall');
  await page.mouse.dblclick(box.x + 120, box.y - 140);
  await page.getByRole('button', { name: 'Hatched zone' }).waitFor({ timeout: 30000 });
}

/** The plan on the left of the open sheet, chosen: its card (with the cut height) comes forward. */
export async function choosePlan(page: Page): Promise<void> {
  await page.mouse.click(560, 400);
  await page.getByLabel('Cut height').waitFor();
}

/** The `Back to sheet` button: the drawing in front is still open while it shows. */
export const backToSheet = (page: Page): Locator => page.getByRole('button', { name: /Back to sheet/i });
