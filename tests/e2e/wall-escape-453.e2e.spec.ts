/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One Escape rule for the drawing tools (#453): Esc ends the tool you are using,
 * wherever the focus is, and never leaves the drawing (the `Back to sheet` button
 * does). A tool card's pattern list or number field used to keep Esc to itself.
 */

import { test, expect, type Page } from '@playwright/test';
import { backToSheet, choosePlan, openDemoSheet } from './wall-demo.helpers';

/** The tool's card is the one with its `Done` button. */
const toolRunning = (page: Page) => page.locator('aside').getByRole('button', { name: 'Done', exact: true });

const PICKS: Record<string, readonly [number, number][]> = {
  Dimension: [[500, 330]],
  'Level mark': [[500, 330]],
  'Section mark': [[500, 330]],
  Tag: [],
  Note: [[500, 330]],
};

for (const [tool, picks] of Object.entries(PICKS)) {
  test(`${tool}: one Esc ends the tool and the drawing stays`, async ({ page }) => {
    test.setTimeout(240000);
    await openDemoSheet(page);
    await choosePlan(page);
    await page.getByRole('button', { name: tool, exact: true }).click();
    await expect(toolRunning(page)).toBeVisible();
    for (const [x, y] of picks) await page.mouse.click(x, y);
    await page.keyboard.press('Escape');
    await expect(toolRunning(page)).toHaveCount(0);
    await expect(backToSheet(page)).toBeVisible();
  });
}

for (const [field, locate] of [
  ['the pattern list', (page: Page) => page.locator('aside select').first()],
  ['the scale field', (page: Page) => page.locator('aside input[type="number"]').first()],
] as const) {
  test(`Hatched zone: Esc with focus in ${field} ends the tool`, async ({ page }) => {
    test.setTimeout(240000);
    await openDemoSheet(page);
    await page.getByRole('button', { name: /Hatched zone/ }).click();
    await expect(toolRunning(page)).toBeVisible();
    await locate(page).focus();
    await page.keyboard.press('Escape');
    await expect(toolRunning(page)).toHaveCount(0);
  });
}
