/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #456: IfcSheet installs as a web app and works offline.
 *
 * Runs against the production preview (`vite preview` on the built `dist/`),
 * because the service worker is only registered in a production build. One
 * online visit, then the network is cut and the page is reloaded: the app must
 * open, load a model from disk and export a PDF with every same-origin
 * request answered from the worker's caches.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL = join(ROOT, 'apps/viewer/public/samples/building-architecture.ifc');

test('#456 after one online visit the app reloads offline, opens a local IFC and exports a PDF', async ({ page, context }, testInfo) => {
  const failedSameOrigin: string[] = [];
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    // Vercel's analytics script exists only on Vercel; there is nothing to cache.
    if (url.origin === new URL(page.url()).origin && !url.pathname.startsWith('/_vercel/')) failedSameOrigin.push(`${request.method()} ${request.url()}`);
  });

  // One online visit; the worker installs (precaches) and takes control.
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, undefined, { timeout: 120000 });
  const caches = await page.evaluate(async () => (await globalThis.caches.keys()).filter((name) => name.startsWith('ifcsheet-')));
  expect(caches.some((name) => name.startsWith('ifcsheet-precache-'))).toBe(true);

  // The manifest the browser installs from.
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)).json());
  expect(manifest).toMatchObject({ name: 'IfcSheet', display: 'standalone', start_url: '/', scope: '/' });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  // Network off, reload: the shell comes from the cache.
  await context.setOffline(true);
  await page.reload();
  const added = page.waitForEvent('console', { predicate: (message) => message.text().includes('[ifc-lite] building-architecture.ifc ('), timeout: 120000 });
  await page.locator('#file-input-open').first().setInputFiles(MODEL);
  await added;

  // Issue the drawing set as a PDF: the sheets are drawn by the worker, the PDF written by the bundled writer.
  const pdfDownload = page.waitForEvent('download', { predicate: (download) => download.suggestedFilename().endsWith('.pdf'), timeout: 120000 });
  await page.getByRole('button', { name: 'Issue the set' }).click();
  await page.getByRole('button', { name: 'Issue as PDF' }).click();
  const pdfPath = testInfo.outputPath('offline.pdf');
  await (await pdfDownload).saveAs(pdfPath);
  const pdf = await readFile(pdfPath);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);

  expect(failedSameOrigin).toEqual([]);
});
