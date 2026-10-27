/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The offline precache rule (#456): the shell, the wasm engine reached through
 * a worker, the fonts and the demo project are in; the optional large files
 * IfcSheet never loads, and the other sample models, are out.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecacheList, type BuiltFile } from './precache-list.js';

const MB = 1024 * 1024;
const files: BuiltFile[] = [
  { path: 'index.html', size: 5_000 },
  { path: 'manifest.json', size: 900 },
  { path: 'sw.js', size: 4_000 },
  { path: 'favicon-192x192-cropped.png', size: 12_000 },
  { path: 'fonts/Inter-Regular.ttf', size: 300_000 },
  { path: 'fonts/Inter-OFL.txt', size: 4_000 },
  { path: 'samples/bloc-p4.ifc', size: 3 * MB },
  { path: 'samples/infra-bridge.ifc', size: 2 * MB },
  { path: 'assets/main-AAAAAAAA.js', size: 5 * MB },
  { path: 'assets/store-BBBBBBBB.js', size: 1 * MB },
  { path: 'assets/useIfcLoader-CCCCCCCC.js', size: 100_000 },
  { path: 'assets/parser.worker-DDDDDDDD.js', size: 4 * MB },
  { path: 'assets/ifc-lite_bg-EEEEEEEE.wasm', size: 10 * MB },
  { path: 'assets/three-dots-FFFFFFFF.js', size: 500 },
  { path: 'assets/cesium-GGGGGGGG.js', size: 5 * MB },
  { path: 'assets/cesium-HHHHHHHH.css', size: 80_000 },
  { path: 'assets/parquet_wasm_bg-IIIIIIII.wasm', size: 5 * MB },
  { path: 'assets/esbuild-JJJJJJJJ.wasm', size: 14 * MB },
  { path: 'assets/maplibre-gl-KKKKKKKK.js', size: 1 * MB },
  { path: 'assets/alignment.worker-LLLLLLLL.js', size: 3 * MB },
  { path: 'cesium/Workers/x.js', size: 9 * MB },
  { path: 'oauth/callback.html', size: 1_000 },
];
const references = new Map<string, string[]>([
  ['assets/main-AAAAAAAA.js', ['assets/store-BBBBBBBB.js', 'assets/useIfcLoader-CCCCCCCC.js', 'assets/cesium-GGGGGGGG.js', 'assets/maplibre-gl-KKKKKKKK.js', 'assets/alignment.worker-LLLLLLLL.js', 'assets/three-dots-FFFFFFFF.js']],
  ['assets/useIfcLoader-CCCCCCCC.js', ['assets/parser.worker-DDDDDDDD.js']],
  ['assets/parser.worker-DDDDDDDD.js', ['assets/ifc-lite_bg-EEEEEEEE.wasm']],
  ['assets/cesium-GGGGGGGG.js', ['assets/cesium-HHHHHHHH.css']],
  ['assets/maplibre-gl-KKKKKKKK.js', ['assets/esbuild-JJJJJJJJ.wasm', 'assets/parquet_wasm_bg-IIIIIIII.wasm']],
]);

describe('offline precache list (#456)', () => {
  const list = buildPrecacheList({ files, shell: ['assets/main-AAAAAAAA.js'], references });

  it('includes the shell, the wasm engine reached through the worker, fonts, icons and the demo project', () => {
    for (const url of ['/', '/manifest.json', '/favicon-192x192-cropped.png', '/fonts/Inter-Regular.ttf', '/samples/bloc-p4.ifc', '/assets/main-AAAAAAAA.js', '/assets/store-BBBBBBBB.js', '/assets/parser.worker-DDDDDDDD.js', '/assets/ifc-lite_bg-EEEEEEEE.wasm']) {
      assert.ok(list.urls.includes(url), `${url} should be precached`);
    }
  });

  it('excludes the large optional assets, the other samples, the font licence and the worker itself', () => {
    for (const url of ['/assets/cesium-GGGGGGGG.js', '/assets/cesium-HHHHHHHH.css', '/assets/parquet_wasm_bg-IIIIIIII.wasm', '/assets/esbuild-JJJJJJJJ.wasm', '/assets/maplibre-gl-KKKKKKKK.js', '/assets/alignment.worker-LLLLLLLL.js', '/cesium/Workers/x.js', '/samples/infra-bridge.ifc', '/fonts/Inter-OFL.txt', '/oauth/callback.html', '/sw.js']) {
      assert.ok(!list.urls.includes(url), `${url} must not be precached`);
    }
    assert.deepEqual(list.skipped.slice(0, 2).map((file) => file.path), ['assets/esbuild-JJJJJJJJ.wasm', 'cesium/Workers/x.js']);
  });

  it('matches the whole chunk name, not a shared first word', () => {
    assert.ok(list.urls.includes('/assets/three-dots-FFFFFFFF.js'));
  });

  it('keeps a shell file even when its name looks optional', () => {
    const withShellCesium = buildPrecacheList({ files, shell: ['assets/main-AAAAAAAA.js', 'assets/cesium-GGGGGGGG.js'], references });
    assert.ok(withShellCesium.urls.includes('/assets/cesium-GGGGGGGG.js'));
  });

  it('adds up the bytes of what it keeps', () => {
    const kept = new Set(list.urls.map((url) => (url === '/' ? 'index.html' : url.slice(1))));
    assert.equal(list.totalBytes, files.filter((file) => kept.has(file.path)).reduce((sum, file) => sum + file.size, 0));
  });
});
