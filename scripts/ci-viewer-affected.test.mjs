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

/** The fixture plus extra tracked files. */
function withFiles(files, opts) {
  const root = fixture(opts);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

test('a test file in a closure package that nothing imports does not run the viewer lanes', () => {
  const root = withFiles({ 'packages/core/src/c.test.ts': 'export {};\n' });
  for (const lane of ['tests', 'build']) {
    const r = viewerAffected({ root, files: ['packages/core/src/c.test.ts'], lane });
    assert.equal(r.affected, false, `${lane}: ${r.reason}`);
  }
});

test('a closure package test file that is imported by name still runs both lanes', () => {
  const root = withFiles(
    { 'packages/core/src/c.test.ts': 'export const x = 1;\n' },
    { viewerSrc: "import { x } from '../../../packages/core/src/c.test';\n" },
  );
  for (const lane of ['tests', 'build']) {
    assert.equal(viewerAffected({ root, files: ['packages/core/src/c.test.ts'], lane }).affected, true, lane);
  }
});

test('a closure package test file mentioned from the root config still runs', () => {
  const root = withFiles({ 'packages/core/src/c.test.ts': 'export {};\n', 'turbo.json': '{"x":"c.test"}\n' });
  assert.equal(viewerAffected({ root, files: ['packages/core/src/c.test.ts'] }).affected, true);
});

test('a viewer test file always runs the shards and skips only the build', () => {
  const root = withFiles({ 'apps/viewer/src/a.test.ts': 'export {};\n' });
  const files = ['apps/viewer/src/a.test.ts'];
  assert.equal(viewerAffected({ root, files, lane: 'tests' }).affected, true);
  assert.equal(viewerAffected({ root, files, lane: 'build' }).affected, false);
});

test('a viewer test file imported by production code still runs the build', () => {
  const root = withFiles(
    { 'apps/viewer/src/a.test.ts': 'export const x = 1;\n' },
    { viewerSrc: "import { x } from './a.test';\n" },
  );
  assert.equal(viewerAffected({ root, files: ['apps/viewer/src/a.test.ts'], lane: 'build' }).affected, true);
});

test('a test file next to a non-test closure file runs both lanes', () => {
  const root = withFiles({ 'packages/core/src/c.test.ts': 'export {};\n' });
  const files = ['packages/core/src/c.test.ts', 'packages/core/src/index.ts'];
  for (const lane of ['tests', 'build']) assert.equal(viewerAffected({ root, files, lane }).affected, true, lane);
});

test('a test file outside every workspace package, or in a package the viewer does not use, is judged as before', () => {
  const root = withFiles({ 'scripts/x.test.mjs': 'export {};\n', 'packages/loose/src/l.test.ts': 'export {};\n' });
  assert.equal(viewerAffected({ root, files: ['scripts/x.test.mjs'] }).affected, true);
  assert.equal(viewerAffected({ root, files: ['packages/loose/src/l.test.ts'] }).affected, false);
});

test('an unknown lane is an error, so the CLI answers true', () => {
  const root = fixture();
  const list = join(root, 'changed.txt');
  writeFileSync(list, 'packages/loose/src/index.ts\n');
  const out = execFileSync('node', [SCRIPT, list, 'nonsense'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.equal(out.trim(), 'true');
});
