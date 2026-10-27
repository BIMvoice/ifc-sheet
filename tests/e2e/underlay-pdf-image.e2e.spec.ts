/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PDF and image underlays in a real browser (#457): the unit tests never run the PDF worker or OffscreenCanvas.
 * Demo project, plan A-101, a page of a two-page PDF and a PNG laid under the drawing, scaled from two clicked
 * points and a typed distance, faded, locked, chosen to print on the sheet, and read back from the sheet's SVG
 * and from its print document. A sheet that is not chosen prints none.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { halfBlackPng, twoPagePdf } from './underlay-fixtures';

const FIXTURE = join(process.cwd(), 'apps/viewer/public/samples/bloc-p4.ifc');
test.use({ viewport: { width: 1400, height: 900 } });

const panel = (page: Page) => page.getByRole('region', { name: 'Underlay' });
const picture = (page: Page) => page.locator('[data-underlay-layer] img[data-underlay-id]');

async function openPlan(page: Page): Promise<void> {
  // The first-run tour would sit over the wall.
  await page.addInitScript(() => localStorage.setItem('ifc-lite:tours:v1', JSON.stringify({ notices: { 'ifcsheet-tour': '2026-01-01' }, tours: {} })));
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
  const hang = page.locator('[data-tour="wall-hang"]');
  await hang.waitFor({ timeout: 180000 });
  await hang.evaluate((e) => (e as HTMLElement).click());
  const sheet = page.locator('button[aria-label^="A-101"]').first();
  await sheet.waitFor();
  await sheet.dblclick();
  await page.getByRole('button', { name: 'Wall', exact: true }).waitFor();
  await page.mouse.dblclick(550, 400); // the plan on the sheet: opens its drawing
  await expect(page.getByRole('button', { name: 'Back to sheet' })).toBeVisible();
  // The drawing settles first: its scale on screen is what the scaling is measured against.
  await expect(page.getByText(/Initializing/)).toBeHidden({ timeout: 60000 });
  await page.waitForTimeout(500);
}

async function addUnderlay(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, pdfPage?: number): Promise<void> {
  if (!(await panel(page).isVisible())) await page.getByRole('button', { name: 'Underlay', exact: true }).click();
  if (pdfPage !== undefined) await panel(page).getByRole('spinbutton', { name: 'PDF page' }).fill(String(pdfPage));
  await panel(page).locator('input[type=file]').setInputFiles(file);
}

/** The share of the picture's pixels that are opaque and dark, read back from what the underlay stored. */
const darkShare = (img: Locator) => img.evaluate(async (el) => {
  const bitmap = await createImageBitmap(await (await fetch((el as HTMLImageElement).src)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128 && px[i] < 60) dark++;
  return dark / (bitmap.width * bitmap.height);
});

const field = async (page: Page, label: string) => Number(await panel(page).getByLabel(label).inputValue());
const rect = async (loc: Locator) => (await loc.boundingBox())!;

/** The matrix of the printed picture on the sheet's paper (millimetres). */
const sheetMatrix = async (page: Page) => {
  const image = page.locator('image[data-underlay-id]');
  await expect(image).toHaveCount(1);
  const [a, b, c, d, e, f] = ((await image.getAttribute('transform')) ?? '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!.map(Number);
  return { a, b, c, d, e, f, image };
};

test('#457 PDF page 2 and a PNG as underlays: scale by two points, fade, lock, print on the sheet', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPlan(page);

  // 1. A PDF, its page 2 (page 1 is empty, page 2 holds one black block of 100 x 50 mm on a 297 x 210 mm page).
  await addUnderlay(page, { name: 'old-plan.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() }, 2);
  const pdf = picture(page).first();
  await expect(pdf).toBeVisible({ timeout: 60000 });
  await expect(panel(page)).toContainText('old-plan.pdf');
  await expect(panel(page)).toContainText('page 2');
  expect(await darkShare(pdf)).toBeGreaterThan(0.07);
  expect(await darkShare(pdf)).toBeLessThan(0.09);
  const size = await pdf.evaluate((el) => ({ w: (el as HTMLImageElement).naturalWidth, h: (el as HTMLImageElement).naturalHeight }));
  expect(size.w / size.h).toBeCloseTo(297 / 210, 2);
  // A PDF page starts at its paper size, 1:1: 297 mm across.
  expect((size.w * (await field(page, 'Scale (mm per pixel)'))) / 297).toBeCloseTo(1, 2);

  await test.info().attach('plan-with-underlay-imported', { body: await page.screenshot(), contentType: 'image/png' });

  // 2. Scale by two points on empty paper, 250 screen pixels apart, which are 5 m.
  const mmPerPx0 = await field(page, 'Scale (mm per pixel)');
  const before = await rect(pdf);
  const metresPerScreenPx = (mmPerPx0 / 1000) * size.w / before.width; // the view's scale: metres of drawing per screen pixel
  await panel(page).getByRole('button', { name: 'Scale by two points' }).click();
  await page.mouse.click(200, 760);
  await page.mouse.click(450, 760);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  const mmPerPx1 = await expect.poll(() => field(page, 'Scale (mm per pixel)')).not.toBe(mmPerPx0).then(() => field(page, 'Scale (mm per pixel)'));
  // 250 screen pixels are 250 * metresPerScreenPx metres at the old scale, and now 5 m.
  // The picture's scale now makes the two points 5 m apart ON THE PICTURE: its pixels between them times the new scale.
  const pixelsBetween = (250 * metresPerScreenPx) / (mmPerPx0 / 1000);
  expect(pixelsBetween * (mmPerPx1 / 1000)).toBeCloseTo(5, 1);
  // The first point stays put: the same picture pixel is under it as before.
  const after = await rect(pdf);
  expect(((200 - after.x) / after.width) * size.w).toBeCloseTo(((200 - before.x) / before.width) * size.w, -1);

  // 3. Opacity, then lock: position and scale refuse, the fade still works.
  await panel(page).getByLabel('Opacity').fill('0.8');
  await expect(pdf).toHaveCSS('opacity', '0.8');
  await panel(page).getByLabel('Lock position and scale').check();
  await expect(panel(page).getByLabel('Scale (mm per pixel)')).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Scale by two points' })).toBeDisabled();

  // 4. Not printed until chosen.
  const sheetBox = panel(page).getByLabel('A-101 Floor plans 1');
  await expect(sheetBox).not.toBeChecked();
  await test.info().attach('plan-with-underlay-locked', { body: await page.screenshot(), contentType: 'image/png' });
  await sheetBox.check();
  await page.getByRole('button', { name: 'Back to sheet' }).click();
  const on = await sheetMatrix(page);
  // The sheet is drawn 1:100: a pixel is mmPerPx1 / 100 mm on paper, upright, centred picture.
  expect(on.a).toBeCloseTo(mmPerPx1 / 100, 4);
  expect(Math.abs(on.d)).toBeCloseTo(on.a, 6);
  expect(on.b).toBeCloseTo(0, 6);
  expect(on.c).toBeCloseTo(0, 6);
  expect(await on.image.getAttribute('opacity')).toBe('0.8');
  expect((await on.image.getAttribute('href'))!.startsWith('data:image/png;base64,')).toBe(true);
  const printed = await on.image.evaluate((el) => new Promise<boolean>((resolve) => { const i = new Image(); i.onload = () => resolve(i.naturalWidth > 0); i.onerror = () => resolve(false); i.src = el.getAttribute('href')!; }));
  expect(printed).toBe(true);

  // 5. The print document carries it too (what "PDF" hands the browser's print dialog).
  await page.getByRole('button', { name: 'Print or save as PDF' }).click();
  const frame = page.locator('iframe').last();
  await expect(frame).toBeAttached();
  const doc = page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:blank')!;
  await expect.poll(() => doc.locator('image[data-underlay-id]').count()).toBe(1);
  expect(await doc.locator('image[data-underlay-id]').getAttribute('transform')).toBe(await on.image.getAttribute('transform'));
  await frame.evaluate((el) => el.remove());

  // 6. Moving the centre to 1 m moves the printed picture 10 mm per metre moved (1:100); a locked picture refuses, so unlock, move, lock.
  await page.getByRole('button', { name: 'Wall', exact: true }).waitFor();
  await page.mouse.dblclick(550, 400);
  await page.getByRole('button', { name: 'Underlay', exact: true }).click();
  await panel(page).getByLabel('Lock position and scale').uncheck();
  const centreX0 = await field(page, 'Centre X (m)'); // the picture moved when it was scaled about the first point
  await panel(page).getByLabel('Centre X (m)').fill('1');
  await panel(page).getByLabel('Lock position and scale').check();
  await page.getByRole('button', { name: 'Back to sheet' }).click();
  const moved = await sheetMatrix(page);
  expect(moved.e - on.e).toBeCloseTo((1 - centreX0) * 10, 2);
  expect(moved.f).toBeCloseTo(on.f, 3);

  // 7. A PNG: kept as a JPEG within the cap, at 96 dpi until scaled.
  await page.getByRole('button', { name: 'Wall', exact: true }).waitFor();
  await page.mouse.dblclick(550, 400);
  await page.getByRole('button', { name: 'Underlay', exact: true }).click();
  await addUnderlay(page, { name: 'scan.png', mimeType: 'image/png', buffer: halfBlackPng() });
  await expect(picture(page)).toHaveCount(2, { timeout: 30000 });
  const png = picture(page).nth(1);
  const pngSize = await png.evaluate((el) => ({ w: (el as HTMLImageElement).naturalWidth, h: (el as HTMLImageElement).naturalHeight, src: (el as HTMLImageElement).src.slice(0, 22) }));
  expect(pngSize).toEqual({ w: 400, h: 200, src: 'data:image/jpeg;base64' });
  expect(await darkShare(png)).toBeGreaterThan(0.45);
  expect(await darkShare(png)).toBeLessThan(0.55);
  const card = panel(page).locator('[data-underlay-card]').nth(1);
  expect(Number(await card.getByLabel('Scale (mm per pixel)').inputValue())).toBeCloseTo((25.4 / 96), 3);

  // 8. Unchoose it: the sheet prints none, and a sheet of other drawings never had it.
  await panel(page).locator('[data-underlay-card]').first().getByLabel('A-101 Floor plans 1').uncheck();
  await page.getByRole('button', { name: 'Back to sheet' }).click();
  await expect(page.locator('image[data-underlay-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Wall', exact: true }).click();
  await page.locator('button[aria-label^="A-102"]').first().dblclick();
  await page.getByRole('button', { name: 'Wall', exact: true }).waitFor();
  await expect(page.locator('image[data-underlay-id]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
