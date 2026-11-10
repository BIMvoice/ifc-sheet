/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// e2e-lane: viewer-e2e

/**
 * A hatched zone already drawn can be changed (#452). The hatch tool's card sets
 * the NEXT zone only, and a chosen zone had no card at all, so changing the pattern
 * of an existing hatch did nothing. The scale and angle fields also snapped back
 * whenever the typed text was not a valid number yet, so a value could not be typed
 * over the old one ("0.5" became "0" then "1").
 */

import { test, expect, type Page } from '@playwright/test';
import { openDemoSheet } from './wall-demo.helpers';

async function drawHatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Polyline' }).click();
  for (const [x, y] of [[400, 620], [560, 620], [560, 700], [400, 700]]) await page.mouse.click(x, y);
  await page.keyboard.type('c');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Hatched zone/ }).click();
  await page.mouse.click(480, 660);
  await page.keyboard.press('Escape');
}

test('a chosen hatch takes the pattern, scale and angle typed in its card', async ({ page }) => {
  test.setTimeout(240000);
  await openDemoSheet(page);
  await drawHatch(page);
  await page.mouse.click(480, 640);
  const pattern = page.getByLabel('Pattern');
  await expect(pattern).toHaveValue('LINES45');

  await pattern.selectOption('STEEL');
  const scale = page.getByRole('spinbutton', { name: 'Scale' });
  await scale.fill('');
  await scale.pressSequentially('0.5');
  await expect(scale).toHaveValue('0.5');

  // Let go of the zone and choose it again: the card reads the zone, not the tool.
  await page.keyboard.press('Escape');
  await expect(pattern).toHaveCount(0);
  await page.mouse.click(480, 640);
  await expect(pattern).toHaveValue('STEEL');
  await expect(scale).toHaveValue('0.5');
});

test('the hatch tool card scale takes a typed value, whatever the pattern', async ({ page }) => {
  test.setTimeout(240000);
  await openDemoSheet(page);
  await page.getByRole('button', { name: /Hatched zone/ }).click();
  for (const name of ['LINES45', 'STEEL']) {
    await page.getByLabel('Pattern').selectOption(name);
    const scale = page.getByRole('spinbutton', { name: 'Scale' });
    await scale.fill('');
    await scale.pressSequentially('2.5');
    await expect(scale).toHaveValue('2.5');
  }
});
