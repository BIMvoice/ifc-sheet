/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Four defects a browser smoke test of main found (#540 to #543), run in the real app on the demo project: the
 * underlay panel is on the drawing opened from a sheet, a drawing's own detail level is in its card, the pencil on a
 * label Tag everything placed keeps the text, and the room schedule's long numbers stay in their column.
 */

import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

const FIXTURE = join(process.cwd(), 'apps/viewer/public/samples/bloc-p4.ifc');
test.use({ viewport: { width: 1400, height: 900 } });

async function openWall(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('ifc-lite:tours:v1', JSON.stringify({ notices: { 'ifcsheet-tour': '2026-01-01' }, tours: {} })));
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
  const hang = page.locator('[data-tour="wall-hang"]');
  await hang.waitFor({ timeout: 180000 });
  await hang.evaluate((e) => (e as HTMLElement).click());
}

async function openSheet(page: Page): Promise<void> {
  await openWall(page);
  const sheet = page.locator('button[aria-label^="A-101"]').first();
  await sheet.waitFor();
  await sheet.dblclick();
  await page.getByRole('button', { name: 'Wall', exact: true }).waitFor();
}

async function openDrawing(page: Page): Promise<void> {
  await openSheet(page);
  await page.mouse.dblclick(550, 400);
  await expect(page.getByRole('button', { name: 'Back to sheet' })).toBeVisible();
  await expect(page.getByText(/Initializing/)).toBeHidden({ timeout: 60000 });
  await page.waitForTimeout(500);
}

test('#540 the underlay panel is on the drawing opened from a sheet', async ({ page }) => {
  await openDrawing(page);
  await expect(page.getByRole('region', { name: 'Underlay' }).or(page.getByRole('button', { name: 'Underlay', exact: true }))).toBeVisible();
});

test('#541 a drawing\'s own detail level is set in its card, and put back', async ({ page }) => {
  await openSheet(page);
  await page.mouse.click(550, 400); // the plan: its card opens
  await page.getByRole('button', { name: /^Graphics/ }).click();
  const level = page.getByRole('combobox', { name: 'Detail level' });
  await expect(level).toBeVisible();
  await level.selectOption('coarse');
  await page.mouse.click(1300, 150);
  await page.mouse.click(550, 400);
  await expect(level).toHaveValue('coarse');
  await level.selectOption('');
  await expect(level).toHaveValue('');
});

test('#542 the pencil on a label Tag everything placed keeps the text, over three lines', async ({ page }) => {
  await openDrawing(page);
  await page.getByRole('button', { name: 'Tag everything' }).click();
  const room = page.locator('svg text', { hasText: /m²/ }).first();
  await expect(room).toBeVisible({ timeout: 30000 });
  const before = (await room.textContent()) ?? '';
  const box = (await room.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole('button', { name: 'Edit text' }).click();
  const editor = page.getByRole('textbox', { name: 'Edit text' });
  await expect(editor).toBeVisible();
  expect(await editor.inputValue()).toContain('\n');
  await editor.fill('Dormitor 2\nDormitor 2\n14.49 m²');
  await editor.press('Enter');
  await expect(page.locator('svg text', { hasText: 'Dormitor 2' })).not.toHaveCount(0);
  await expect(page.locator('[data-tag-override]')).toHaveCount(1);
  expect(before).not.toContain('Dormitor 2');
});

test('#543 a long room number stays in its column of the room schedule', async ({ page }) => {
  await openWall(page);
  await page.getByRole('button', { name: 'Project', exact: true }).first().click();
  await page.getByRole('button', { name: '+ Room and area schedule' }).click();
  await page.getByText('Room and area schedule', { exact: true }).last().click();
  const number = page.locator('svg text', { hasText: /^Casa scarii parter$/ });
  await expect(number.first()).toBeVisible({ timeout: 30000 });
  // The number's right edge is left of the next cell on its row (the room's name, a second `Casa scarii parter`).
  const [a, b] = await number.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).sort((p, q) => p.left - q.left).map((r) => ({ left: r.left, right: r.right })));
  expect(b, 'the number and the name both print').toBeTruthy();
  expect(a.right).toBeLessThanOrEqual(b.left);
});
