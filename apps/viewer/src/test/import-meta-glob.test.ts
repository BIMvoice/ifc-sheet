/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- a plain .mjs module of the test harness, without types
import { expandGlob, globCalls, parseGlobArguments, transformImportMetaGlob } from './import-meta-glob.mjs';
import * as registry from './__fixtures__/import-meta-glob/registry';

const REGISTRY = fileURLToPath(new URL('./__fixtures__/import-meta-glob/registry.ts', import.meta.url));

describe('import.meta.glob under the test runner', () => {
  it('builds what Vite builds for an eager glob: the matched modules by path, sorted, exclusions out', () => {
    assert.deepEqual(Object.keys(registry.eager), ['./entries/a.ts', './entries/b.ts']);
    assert.deepEqual(Object.values(registry.eager).map((m) => m.value), ['a', 'b']);
  });

  it('picks one export with `import`', () => {
    assert.deepEqual(registry.defaults, { './entries/a.ts': 'A', './entries/b.ts': 'B', './entries/c.skip.ts': 'X' });
  });

  it('builds loaders for a lazy glob', async () => {
    assert.deepEqual(Object.keys(registry.lazy), ['./entries/a.ts', './entries/b.ts', './entries/c.skip.ts']);
    assert.equal((await registry.lazy['./entries/b.ts']()).value, 'b');
    assert.equal(await registry.lazyValue['./entries/a.ts'](), 'a');
  });

  it('never matches the importing file itself', () => {
    assert.deepEqual(Object.keys(registry.self), ['./outside.ts']);
  });

  it('leaves comments and strings alone', () => {
    assert.equal(registry.text, "import.meta.glob('./outside.ts', { eager: true })");
  });

  it('rewrites only the plain subset and leaves any other call as it is', () => {
    for (const args of ["'./x/**/*.ts'", "'./x/{a,b}.ts'", "'/abs/*.ts'", "'x/*.ts'", "'./*/a.ts'", 'pattern', "'./x/*.ts', { query: '?raw' }", "'./x/*.ts', { eager: flag }", "'./x/*.ts', { import: 1 }", '[]']) {
      assert.equal(parseGlobArguments(args), null, args);
    }
    const untouched = "const m = import.meta.glob('./x/**/*.ts', { eager: true });";
    assert.equal(transformImportMetaGlob(untouched, new URL('file:///repo/a.ts').href), null);
  });

  it('finds the calls the import guard follows, with their patterns and options', () => {
    const calls = globCalls("// import.meta.glob('./no.ts')\nconst a = import.meta.glob(['./entries/*.ts', '!./entries/*.skip.ts'], { eager: true });");
    assert.deepEqual(calls.map((c: { patterns: string[]; options: { eager: boolean } }) => [c.patterns, c.options.eager]), [[['./entries/*.ts', '!./entries/*.skip.ts'], true]]);
    assert.deepEqual(expandGlob(REGISTRY, ['./entries/*.ts', '!./entries/*.skip.ts']).map(([key]: [string, string]) => key), ['./entries/a.ts', './entries/b.ts']);
  });
});
