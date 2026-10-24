/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's viewport card is bounded by the sheet area and scrolls inside itself (#288).
 * A schedule's card is taller than a 1280x800 window; a focused field in it must scroll the
 * card, never the app shell: the left tool rail, the sheet and the help bar stay where they are.
 */

import { test, expect } from '@playwright/test';
import { join } from 'path';

const FIXTURE = 'apps/viewer/public/samples/bloc-p4.ifc';

test('the tallest viewport card scrolls inside itself and the shell stays put', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(join(process.cwd(), FIXTURE));
  const hang = page.locator('[data-tour="wall-hang"]');
  await hang.waitFor({ timeout: 180000 });
  await hang.evaluate((e) => (e as HTMLElement).click());
  await page.getByRole('button', { name: 'Project', exact: true }).last().click();
  await page.getByRole('button', { name: '+ Door and window schedule' }).click();
  await page.waitForTimeout(4000);
  await page.mouse.click(450, 200);
  const card = page.locator('aside').first();
  await expect(card).toBeVisible();
  // The card's sections start folded (#290); open every one to make the tallest card the test is about.
  for (const title of ['Sub-reports', 'Content', 'Filter', 'Text rows']) {
    // CSS, not roles: the guided tour is modal and takes the page behind it out of the accessibility tree.
    const heading = card.locator('button[aria-expanded]', { hasText: title }).first();
    if ((await heading.getAttribute('aria-expanded')) === 'false') await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
  }
  const rail = page.locator('nav[aria-label]').filter({ hasText: 'Dimension' }).first();
  const railTop = (await rail.boundingBox())!.top ?? (await rail.boundingBox())!.y;
  const help = page.locator('footer').filter({ hasText: 'Inside a sheet' });
  const helpBottom = async () => { const b = (await help.boundingBox())!; return b.y + b.height; };
  const helpBefore = await helpBottom();

  const m = await card.evaluate((a) => ({ overflowY: getComputedStyle(a).overflowY, client: a.clientHeight, scroll: a.scrollHeight }));
  expect(m.overflowY).toBe('auto');
  expect(m.scroll, 'the card is taller than its box: the test exercises the bound').toBeGreaterThan(m.client);

  await card.locator('select').last().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const after = await page.evaluate(() => {
    let shell = 0;
    for (const el of document.querySelectorAll('*')) if (!el.closest('aside') && el.scrollTop) shell += el.scrollTop;
    return { page: document.scrollingElement!.scrollTop, shell };
  });
  expect(after.page).toBe(0);
  expect(after.shell, 'no element outside the card scrolled').toBe(0);
  expect((await rail.boundingBox())!.y).toBe(railTop);
  expect(await helpBottom()).toBe(helpBefore);
  expect(await card.evaluate((a) => a.scrollTop), 'the card itself scrolled the field into view').toBeGreaterThan(0);
});
