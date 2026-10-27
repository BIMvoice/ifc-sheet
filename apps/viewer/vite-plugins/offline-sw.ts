/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writes `sw.js`, the offline service worker (#456), into the build output.
 *
 * A hand-written worker (`offline-sw.template.js`) plus this step, rather than
 * a service-worker plugin: the build's chunking and its top-level-await
 * rewrite are pinned and gated (#201, `scripts/check-tla-chunk-await.mjs`),
 * and a plugin that rewrites chunks or injects a manifest into them would sit
 * inside that. This one runs after the bundle is written, reads the files it
 * wrote, and adds one file; it changes no chunk.
 *
 * The cache name is a hash of the precached files' names and contents, so a
 * deploy that changes any of them is a new worker with a new cache, and one
 * that changes none is not.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { buildPrecacheList, type BuiltFile } from '../src/offline/precache-list';

function listFiles(dir: string, base = dir): BuiltFile[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [{ path: path.relative(base, full).split(path.sep).join('/'), size: fs.statSync(full).size }];
  });
}

/** Which build files each script and style names, and which ones `index.html` names. */
function readReferences(dir: string, files: readonly BuiltFile[]): { shell: string[]; references: Map<string, string[]> } {
  const byName = new Map(files.filter((file) => file.path.startsWith('assets/')).map((file) => [path.posix.basename(file.path), file.path]));
  const named = (text: string, self: string): string[] => {
    const found = new Set<string>();
    for (const match of text.matchAll(/[A-Za-z0-9_.$-]+\.(?:js|mjs|css|wasm)/g)) {
      const target = byName.get(match[0]);
      if (target && target !== self) found.add(target);
    }
    return [...found];
  };
  const references = new Map<string, string[]>();
  for (const file of files) {
    if (/\.(js|mjs|css)$/.test(file.path)) references.set(file.path, named(fs.readFileSync(path.join(dir, file.path), 'utf8'), file.path));
  }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const shell = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((match) => match[1]);
  return { shell, references };
}

export function offlineSw(template: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'offline-sw',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      order: 'post',
      handler() {
        const files = listFiles(outDir);
        const list = buildPrecacheList({ files, ...readReferences(outDir, files) });
        const hash = crypto.createHash('sha256');
        for (const url of list.urls) {
          hash.update(url);
          hash.update(fs.readFileSync(path.join(outDir, url === '/' ? 'index.html' : url.slice(1))));
        }
        const source = fs.readFileSync(template, 'utf8')
          .replace("'__BUILD_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 16)))
          .replace("'__PRECACHE_URLS__'", JSON.stringify(list.urls));
        fs.writeFileSync(path.join(outDir, 'sw.js'), source);
        const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
        console.log(`[offline-sw] precache: ${list.urls.length} files, ${mb(list.totalBytes)} MB; left out: ${list.skipped.length} files, ${mb(list.skipped.reduce((sum, f) => sum + f.size, 0))} MB`);
      },
    },
  };
}
