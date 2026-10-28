/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's cut height moves when its dot is dragged (#451). The ruler is 220 px
 * tall and its dot sits at the stored height; the control under the dot used to be
 * only as tall as a range input is by default, so the dot at the usual 1.20 m was
 * outside it and a drag from the dot did nothing. Alt + wheel inside the plan is
 * the other way to move it.
 */

import { test, expect } from '@playwright/test';
import { choosePlan, openDemoSheet } from './wall-demo.helpers';

test('dragging the cut height dot from where it sits moves the cut', async ({ page }) => {
  test.setTimeout(240000);
  await openDemoSheet(page);
  await choosePlan(page);
  const range = page.getByLabel('Cut height');
  expect(Number(await range.inputValue())).toBeCloseTo(1.2, 2);

  // The control spans the whole ruler the dot rides on.
  const ruler = await range.evaluate((e) => e.parentElement!.getBoundingClientRect().height);
  const control = (await range.boundingBox())!;
  expect(control.height).toBeGreaterThanOrEqual(ruler - 1);

  // Grab the dot itself, drag it up towards the head height.
  const dot = (await range.evaluate((e) => {
    const r = e.parentElement!.querySelector('span.pointer-events-none')!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }));
  await page.mouse.move(dot.x, dot.y);
  await page.mouse.down();
  await page.mouse.move(dot.x, dot.y - 80, { steps: 10 });
  await page.mouse.up();
  expect(Number(await range.inputValue())).toBeGreaterThan(1.5);
});

test('Alt + wheel inside the plan steps the cut height', async ({ page }) => {
  test.setTimeout(240000);
  await openDemoSheet(page);
  await choosePlan(page);
  const range = page.getByLabel('Cut height');
  await page.keyboard.down('Alt');
  await page.mouse.move(560, 400);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Alt');
  await expect.poll(async () => Number(await range.inputValue())).toBeCloseTo(1.4, 2);
});
