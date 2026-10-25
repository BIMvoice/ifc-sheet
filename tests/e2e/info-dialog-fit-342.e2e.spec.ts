/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Info dialog fits its box in Română and English (#342). Its grid column used to grow to the widest
 * unbreakable content (the tab strip, the Learn tab), so the header and the panels stuck out past the right
 * edge. No element inside the dialog may extend beyond the dialog's right edge, on any tab, and the page
 * never scrolls sideways.
 */

import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';

const FIXTURE = 'apps/viewer/public/samples/bloc-p4.ifc';

async function overflow(page: Page) {
  return page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role=dialog]')].pop()!;
    const edge = dlg.getBoundingClientRect().right;
    const out: string[] = [];
    for (const el of dlg.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > edge + 0.5) out.push(`${el.tagName}.${String(el.getAttribute('class')).slice(0, 50)} +${Math.round(b.right - edge)}`);
    }
    const se = document.scrollingElement!;
    return { out, scroll: se.scrollWidth, client: se.clientWidth };
  });
}

for (const [locale, width, height] of [['ro', 1024, 768], ['ro', 1280, 800], ['en', 1024, 768]] as const) {
  test(`no element of the Info dialog passes its right edge (${locale} ${width}x${height})`, async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript((l) => { try { localStorage.setItem('ifc-lite:locale', l); } catch { /* storage may be blocked */ } }, locale);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('input[type="file"]').first().setInputFiles(join(process.cwd(), FIXTURE));
    const hang = page.locator('[data-tour="wall-hang"]');
    await hang.waitFor({ timeout: 180000 });
    await hang.evaluate((e) => (e as HTMLElement).click());
    await page.getByRole('button', { name: /^(Keyboard|Tastatură)$/ }).first().evaluate((e) => (e as HTMLElement).click());
    const tabs = page.locator('[role=dialog] [role=tab]');
    await expect(tabs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      const m = await overflow(page);
      expect(m.out, `tab ${i}`).toEqual([]);
      expect(m.scroll, `tab ${i}: no horizontal page scroll`).toBeLessThanOrEqual(m.client);
    }
    // The keyboard settings, behind the Shortcuts tab's button, are the widest content of all.
    await tabs.nth(2).click();
    await page.locator('[role=tabpanel] button', { hasText: /Customise keys|Personalizați tastele/ }).first().click();
    const m = await overflow(page);
    expect(m.out, 'keyboard settings').toEqual([]);
    expect(m.scroll).toBeLessThanOrEqual(m.client);
  });
}
