/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The engine as a stranger gets it: `pack-ifcsheet.mjs` makes the one tarball, `npm install` puts it in an empty folder
 * (the outside dependencies come from the registry, so this needs the network), and from there the `ifcsheet` command
 * and the library both turn AC20-FZK-Haus into a drawing set. Before the tarball carried our own `@ifc-lite/*` copies,
 * the install succeeded and the first run failed on load (`docs/architecture/npm-publishing.md`).
 *
 * Needs the packages built and the wasm bundle; without them it skips and says what to run.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closureOf, pack } from './pack-ifcsheet.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FZK = join(ROOT, 'apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc');
const missing = !existsSync(join(ROOT, 'packages/wasm/pkg/ifc-lite_bg.wasm')) ? 'the wasm bundle is not built: run `pnpm build:wasm:fetch`'
  : !existsSync(join(ROOT, 'packages/ifcsheet/dist/bin.js')) ? 'the packages are not built: run `pnpm turbo run build --filter="@bimvoice/ifcsheet..."`'
  : null;
if (missing) console.warn(`[pack-ifcsheet] skipping the install test: ${missing}`);

const work = mkdtempSync(join(tmpdir(), 'ifcsheet-install-'));
after(() => rmSync(work, { recursive: true, force: true }));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('the closure the tarball carries', () => {
  it('bundles every workspace package the engine reaches, and asks the registry for none of them', () => {
    const { bundled, outside, byName } = closureOf();
    assert.ok(bundled.includes('@ifc-lite/wasm') && bundled.includes('@ifc-lite/parser'), 'the geometry engine and the parser travel inside');
    for (const name of bundled) for (const dep of Object.keys(byName.get(name).manifest.dependencies ?? {})) {
      assert.ok(!byName.has(dep) || bundled.includes(dep), `${name} needs ${dep}, which is not bundled`);
    }
    assert.deepEqual([...outside.keys()].filter((name) => name.startsWith('@ifc-lite/') || name.startsWith('@bimvoice/')), []);
  });
});

describe('the packed engine in an empty folder', { skip: missing ?? false }, () => {
  const app = join(work, 'app');
  let tarball = '';

  it('installs from the one tarball', () => {
    tarball = pack(join(work, 'out'));
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'stranger', private: true, type: 'module' }));
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], app);
    const inside = join(app, 'node_modules/@bimvoice/ifcsheet/node_modules/@ifc-lite');
    assert.deepEqual(readdirSync(inside).sort(), closureOf().bundled.map((name) => name.replace('@ifc-lite/', '')), 'our copies are the ones installed');
    assert.equal(existsSync(join(app, 'node_modules/@ifc-lite')), false, 'none came from the registry');
    assert.equal(JSON.parse(readFileSync(join(app, 'node_modules/@bimvoice/ifcsheet/package.json'), 'utf8')).private, undefined);
  });

  it('runs the ifcsheet command: a PDF and a DXF per sheet', () => {
    const out = run('npx', ['--no-install', 'ifcsheet', 'build', FZK, '--out', 'out/set.pdf', '--dxf', 'out/dxf'], app);
    assert.match(out, /set\.pdf: \d+ sheets?/);
    assert.equal(readFileSync(join(app, 'out/set.pdf')).subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(readdirSync(join(app, 'out/dxf')).filter((f) => f.endsWith('.dxf')).length >= 3);
  });

  it('is importable as a library: the model opened, the set laid out, the PDF written', () => {
    writeFileSync(join(app, 'use.mjs'), `
      import { readFileSync, writeFileSync } from 'node:fs';
      import { generateDefaultSet } from '@bimvoice/ifcsheet';
      import { exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';
      const model = await openModel(new Uint8Array(readFileSync(process.argv[2])));
      const set = generateDefaultSet(model);
      const sheets = await sheetGraphics(set, model);
      writeFileSync('library.pdf', await exportPdf(sheets));
      console.log(sheets.map((s) => s.number).join(','));
    `);
    const out = run('node', ['use.mjs', FZK], app);
    assert.match(out, /A-101/);
    assert.ok(statSync(join(app, 'library.pdf')).size > 10_000);
  });
});
