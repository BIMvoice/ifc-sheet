/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { viewerAffected, viewerClosure, workspacePackages } from './ci-viewer-affected.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ci-viewer-affected.mjs');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

/** A throwaway git repo: viewer -> core -> leaf-dep; `loose` and `pathy` are unrelated or path-imported. */
function fixture({ viewerSrc = 'export {};\n' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'viewer-affected-'));
  roots.push(root);
  const put = (rel, body) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  };
  const pkg = (name, deps = {}) => JSON.stringify({ name, dependencies: deps });
  put('apps/viewer/package.json', pkg('@x/viewer', { '@x/core': 'workspace:*' }));
  put('apps/viewer/src/main.ts', viewerSrc);
  put('packages/core/package.json', pkg('@x/core', { '@x/leaf': 'workspace:*' }));
  put('packages/core/src/index.ts', 'export {};\n');
  put('packages/leaf/package.json', pkg('@x/leaf'));
  put('packages/loose/package.json', pkg('@x/loose'));
  put('packages/loose/src/index.ts', 'export {};\n');
  put('packages/pathy/package.json', pkg('@x/pathy'));
  put('package.json', '{"name":"root"}');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('closure follows dependencies transitively and includes the viewer', () => {
  const root = fixture();
  const closure = viewerClosure(workspacePackages(root));
  assert.deepEqual([...closure].sort(), ['apps/viewer', 'packages/core', 'packages/leaf']);
});

test('a package nobody depends on or mentions does not affect the viewer', () => {
  const root = fixture();
  const r = viewerAffected({ root, files: ['packages/loose/src/index.ts', 'packages/loose/package.json'] });
  assert.equal(r.affected, false, r.reason);
});

test('a direct dependency affects the viewer', () => {
  const r = viewerAffected({ root: fixture(), files: ['packages/core/src/index.ts'] });
  assert.equal(r.affected, true);
});

test('a transitive dependency affects the viewer', () => {
  const r = viewerAffected({ root: fixture(), files: ['packages/leaf/package.json'] });
  assert.equal(r.affected, true);
});

test('the viewer itself affects the viewer', () => {
  const r = viewerAffected({ root: fixture(), files: ['apps/viewer/src/main.ts'] });
  assert.equal(r.affected, true);
});

test('one affecting file among unaffected ones wins', () => {
  const r = viewerAffected({ root: fixture(), files: ['packages/loose/src/index.ts', 'packages/core/src/index.ts'] });
  assert.equal(r.affected, true);
});

test('a file outside any workspace package affects the viewer', () => {
  for (const f of ['package.json', 'scripts/x.mjs', 'shared/ai/a.ts', 'packages/stray.txt', 'packages/nopkg/src/a.ts']) {
    assert.equal(viewerAffected({ root: fixture(), files: [f] }).affected, true, f);
  }
});

test('no files means run', () => {
  assert.equal(viewerAffected({ root: fixture(), files: [] }).affected, true);
});

test('a path import the manifest does not show still counts', () => {
  // tsconfig-paths / relative imports bypass package.json; the textual guard catches them.
  for (const src of [
    "import a from '../../../packages/pathy/src/a';\n",
    "import a from '@x/pathy';\n",
    "import a from '../../pathy/src/a';\n",
  ]) {
    const root = fixture({ viewerSrc: src });
    const r = viewerAffected({ root, files: ['packages/pathy/src/a.ts'] });
    assert.equal(r.affected, true, src);
  }
});

test('a markdown mention is prose, not an import', () => {
  const root = fixture();
  mkdirSync(join(root, 'apps/viewer'), { recursive: true });
  writeFileSync(join(root, 'apps/viewer/CHANGELOG.md'), 'mentions @x/pathy and packages/pathy\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  assert.equal(viewerAffected({ root, files: ['packages/pathy/src/a.ts'] }).affected, false);
});

test('the CLI prints false for the unaffected case, true for an affecting file and true on error', () => {
  const root = fixture();
  const list = join(root, 'changed.txt');
  const run = (body, file = list) => {
    if (body !== null) writeFileSync(list, body);
    return execFileSync('node', [SCRIPT, file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  };
  assert.equal(run('packages/loose/src/index.ts\n'), 'false');
  assert.equal(run('packages/loose/src/index.ts\npackages/core/src/index.ts\n'), 'true');
  assert.equal(run(null, join(root, 'does-not-exist.txt')), 'true');
});
