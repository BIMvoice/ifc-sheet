/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tab never leaves the IfcSheet face into the covered engine interface (#295): 30 Tab presses from the top
 * bar land only on the face (or a portal above it), never on the ribbon and panels under the Wall.
 */

import { test, expect } from '@playwright/test';
import { join } from 'path';

const FIXTURE = 'apps/viewer/public/samples/bloc-p4.ifc';

test('tabbing 30 times from the top bar never focuses a control under the cover', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(join(process.cwd(), FIXTURE));
  const hang = page.locator('[data-tour="wall-hang"]');
  await hang.waitFor({ timeout: 180000 });
  await hang.evaluate((e) => (e as HTMLElement).click());
  await page.locator('[data-engine-root][inert]').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Project', exact: true }).last().focus();
  const where: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    where.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      return el.closest('[data-engine-root]') ? 'ENGINE' : el.closest('[data-ifcsheet-shell]') ? 'face' : 'portal';
    }));
  }
  expect(where.filter((w) => w === 'ENGINE'), where.join(',')).toEqual([]);
  expect(where.filter((w) => w === 'face').length, 'focus did move through the face').toBeGreaterThan(5);
});
