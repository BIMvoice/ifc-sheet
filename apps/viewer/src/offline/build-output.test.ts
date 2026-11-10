/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #456: what the production build actually emits. Reads `apps/viewer/dist`
 * (run `pnpm build` in apps/viewer first; the test skips when there is no
 * build): a valid web app manifest linked from `index.html`, and a `sw.js`
 * whose precache list holds the app shell, its entry script and the wasm
 * engine, every entry of it a file that exists in the build.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const dist = new URL('../../dist/', import.meta.url);
const built = existsSync(new URL('sw.js', dist));
const skip = built ? false : 'no viewer build in apps/viewer/dist: run `pnpm build` there first';

function precacheUrls(): string[] {
  const source = readFileSync(new URL('sw.js', dist), 'utf8');
  const match = /const URLS = (\[.*?\]);/s.exec(source);
  assert.ok(match, 'sw.js has a literal precache list');
  return vm.runInNewContext(match[1]) as string[];
}

describe('viewer build output for the offline app (#456)', { skip }, () => {
  it('emits a web app manifest that browsers can install from, linked from index.html', () => {
    const html = readFileSync(new URL('index.html', dist), 'utf8');
    assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/manifest\.json"/);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dist), 'utf8'));
    assert.equal(manifest.name, 'IfcSheet');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.ok(manifest.background_color && manifest.theme_color);
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'icons of 192 and 512 pixels');
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      assert.equal(icon.type, 'image/png');
      assert.ok(existsSync(new URL(icon.src.slice(1), dist)), `${icon.src} is in the build`);
    }
  });

  it('emits a service worker with no unfilled placeholder', () => {
    const source = readFileSync(new URL('sw.js', dist), 'utf8');
    assert.ok(!source.includes('__BUILD_VERSION__') && !source.includes('__PRECACHE_URLS__'));
    assert.match(source, /const VERSION = "[0-9a-f]{16}"/);
  });

  it('precaches the shell, the entry scripts named by index.html and the wasm engine', () => {
    const urls = precacheUrls();
    const html = readFileSync(new URL('index.html', dist), 'utf8');
    const entries = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(entries.length > 0, 'index.html names built assets');
    assert.ok(urls.includes('/'), 'the shell');
    for (const entry of entries) assert.ok(urls.includes(entry), `${entry} is precached`);
    assert.ok(urls.some((url) => /^\/assets\/ifc-lite_bg-.*\.wasm$/.test(url)), 'the ifc-lite wasm engine');
    for (const url of urls) assert.ok(existsSync(new URL(url === '/' ? 'index.html' : url.slice(1), dist)), `${url} is in the build`);
  });
});
