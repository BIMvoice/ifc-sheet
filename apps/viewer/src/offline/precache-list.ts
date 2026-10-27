/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which files of a finished build the offline service worker caches at install
 * (#456). A pure function over the build's file list and its reference graph,
 * so the rule is testable without a build; `vite-plugins/offline-sw.ts` only
 * reads the files and the references out of the build output.
 *
 * Precached:
 *  - the app shell: `index.html` and every script, style and preload it lists
 *    (an online visit downloads these anyway), the manifest, icons and fonts;
 *  - what those files reach by `import()`, `new Worker(new URL(...))` and
 *    `new URL('x.wasm', import.meta.url)`, followed through the build's own
 *    text, EXCEPT the optional files below: this is how the wasm geometry
 *    engine, the model-parsing worker and the PDF writer come in;
 *  - the demo project.
 *
 * Left out: files only a feature IfcSheet does not show needs (3D globe tiles,
 * maps, charts' tables, scripting, the /mcp landing's 3D, collaboration
 * documents, point-cloud decoders, PDF import). Whatever is not listed is
 * still cached by the worker the first time it is fetched, so it works offline
 * from its second use.
 */

export interface BuiltFile {
  /** Posix path relative to the build output directory, no leading slash. */
  path: string;
  size: number;
}

export interface PrecacheInput {
  files: readonly BuiltFile[];
  /** Build files `index.html` names (script, modulepreload, stylesheet). */
  shell: readonly string[];
  /** For a build file, the other build files its text names. */
  references: ReadonlyMap<string, readonly string[]>;
}

/**
 * File names (without directory) of what only a feature IfcSheet does not show
 * loads. A built name is `<chunk>-<8-character hash>.<ext>`, so the match is on
 * the whole name: `three-AbCd1234.js` is optional, `three-dots-AbCd1234.js` (an
 * icon) is not.
 */
const OPTIONAL_CHUNKS = [
  'cesium', 'three', 'maplibre-gl', 'maplibre-gl-worker', 'esbuild', 'parquet', 'parquet_wasm_bg', 'quickjs-eval',
  'automerge_wasm_bg', 'emscripten-module', 'emscripten-module.browser', 'laz-perf', 'openjpeg', 'openjpeg_nowasm_fallback',
  'pdf.worker.min', 'browser-backend', 'McpPlayground', 'SemanticPanel', 'idsValidation.worker', 'landXml.worker',
  'semantic.worker', 'alignment.worker', 'overlay-parse.worker', 'appearance.worker', 'scanDetect.worker', 'scanOutline.worker',
];
const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const OPTIONAL_ASSET_PATTERNS: readonly RegExp[] = [
  new RegExp(`^(?:${OPTIONAL_CHUNKS.map(escape).join('|')})-[^.]{8}\\.(?:js|mjs|css|wasm)$`),
  /duckdb/i,
];

/** The demo project (`components/viewer/ifcsheet/demo-model.ts`): the only sample the IfcSheet face opens by itself. */
export const DEMO_PROJECT_PATH = 'samples/bloc-p4.ifc';

const FIXED_FILES = new Set(['index.html', 'manifest.json', 'apple-touch-icon.png', 'favicon.ico', 'logo.png', DEMO_PROJECT_PATH]);

function isFixed(path: string): boolean {
  return FIXED_FILES.has(path) || /^favicon-[^/]*\.png$/.test(path) || /^fonts\/[^/]+\.(ttf|woff2?)$/i.test(path);
}

const isOptional = (path: string): boolean => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return OPTIONAL_ASSET_PATTERNS.some((pattern) => pattern.test(name));
};

export interface PrecacheList {
  /** URL paths with a leading slash; the shell page is `/`. */
  urls: string[];
  totalBytes: number;
  /** Build files not precached, largest first, for the build log. */
  skipped: BuiltFile[];
}

export function buildPrecacheList({ files, shell, references }: PrecacheInput): PrecacheList {
  const known = new Set(files.map((file) => file.path));
  const chosen = new Set(files.filter((file) => isFixed(file.path)).map((file) => file.path));
  const queue = shell.filter((path) => known.has(path));
  for (const path of queue) chosen.add(path);
  while (queue.length > 0) {
    for (const next of references.get(queue.pop()!) ?? []) {
      if (!known.has(next) || chosen.has(next) || isOptional(next)) continue;
      chosen.add(next);
      queue.push(next);
    }
  }
  chosen.delete('sw.js');
  const kept = files.filter((file) => chosen.has(file.path));
  const skipped = files.filter((file) => !chosen.has(file.path) && file.path !== 'sw.js').sort((a, b) => b.size - a.size);
  const urls = kept.map((file) => (file.path === 'index.html' ? '/' : `/${file.path}`)).sort();
  return { urls, totalBytes: kept.reduce((sum, file) => sum + file.size, 0), skipped };
}
