/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #856: a clean clone ran `pnpm build:wasm:fetch` and got a build that failed
 * two steps later (TS7016, then missing exports). This runs the real script
 * against the REAL committed packages/wasm/pkg/ifc-lite.d.ts with a stubbed
 * `npm` that serves a published runtime lacking three exports this repo uses,
 * and wants a non-zero exit that names them and the fix. Without the committed
 * .d.ts the script has nothing to compare with and exits 0.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classMembers, declaredExports } from './lib/wasm-export-parity.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const realDts = resolve(here, '../packages/wasm/pkg/ifc-lite.d.ts');
const LACKING = ['setGeometryProgressCallback', 'proposeScanElements', 'segmentScanPoints'];
const roots = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function makeCheckout({ withDts }) {
  const root = mkdtempSync(join(tmpdir(), 'fetch-wasm-856-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(here, 'fetch-prebuilt-wasm.mjs'), join(root, 'scripts/fetch-prebuilt-wasm.mjs'));
  cpSync(join(here, 'lib'), join(root, 'scripts/lib'), { recursive: true });
  mkdirSync(join(root, 'packages/wasm/pkg'), { recursive: true });
  writeFileSync(join(root, 'packages/wasm/package.json'), JSON.stringify({ name: '@ifc-lite/wasm', version: '10.3.0' }));
  const dts = readFileSync(realDts, 'utf8');
  if (withDts) writeFileSync(join(root, 'packages/wasm/pkg/ifc-lite.d.ts'), dts);
  // A published runtime that has every declared export and class method except the three above.
  const classes = new Map();
  for (const full of classMembers(dts, true)) {
    const [c, m] = full.split('.');
    if (!classes.has(c)) classes.set(c, []);
    if (!LACKING.includes(m)) classes.get(c).push(m);
  }
  const skip = new Set(['default', ...classes.keys(), ...LACKING]);
  const names = [...declaredExports(dts)].filter((n) => !skip.has(n));
  const src = join(root, 'published/package/pkg');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, 'ifc-lite.js'),
    [...classes].map(([c, ms]) => `export class ${c} {\n${ms.map((m) => `    ${m}() {}\n`).join('')}}\n`).join('') +
      names.map((n) => `export function ${n}() {}\n`).join('') +
      'async function init() {}\nexport { init as default };\n',
  );
  writeFileSync(join(src, 'ifc-lite_bg.wasm'), 'PUBLISHED-WASM');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'npm'),
    `#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
execFileSync('tar', ['-czf', 'stub.tgz', '-C', ${JSON.stringify(join(root, 'published'))}, 'package']);
console.log(JSON.stringify([{ filename: 'stub.tgz' }]));
`,
  );
  chmodSync(join(bin, 'npm'), 0o755);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [join(root, 'scripts/fetch-prebuilt-wasm.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
  });
}

test('#856 the repository carries the generated ifc-lite.d.ts', () => {
  assert.ok(existsSync(realDts), 'packages/wasm/pkg/ifc-lite.d.ts is not committed; run scripts/build-wasm.sh and commit it');
  const declared = new Set([...declaredExports(readFileSync(realDts, 'utf8')), ...classMembers(readFileSync(realDts, 'utf8'), true)]);
  assert.ok(declared.has('IfcAPI.proposeScanElements') && declared.has('IfcAPI.segmentScanPoints'));
  assert.ok(declared.has('setGeometryProgressCallback'));
});

test('#856 a fetch on a clean tree whose published runtime is behind exits non-zero naming the exports and the fix', () => {
  const root = makeCheckout({ withDts: true });
  const r = run(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const words = new Set(r.stderr.split(/\W+/));
  assert.deepEqual(LACKING.filter((n) => words.has(n)), LACKING);
  assert.match(r.stderr, /pnpm build:wasm/);
  assert.equal(existsSync(join(root, 'packages/wasm/pkg/ifc-lite_bg.wasm')), false);
});

test('#856 a tree without the committed d.ts is refused with a message, not given a runtime', () => {
  const root = makeCheckout({ withDts: false });
  const r = run(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ifc-lite\.d\.ts is missing/);
  assert.equal(existsSync(join(root, 'packages/wasm/pkg/ifc-lite_bg.wasm')), false);
});
