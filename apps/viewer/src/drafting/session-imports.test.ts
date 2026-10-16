/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting session is core: the commands it runs may not drag the sheet
 * UI or the issue pipeline (WallSheet, react-dom, the zipper, print) into it.
 * Without them in its graph the cycle session -> issue -> WallSheet -> ... ->
 * session cannot exist either. ISSUE reaches the issue module by a dynamic
 * import, which this walk does not follow on purpose: it is loaded when the
 * command runs. (The app store, which the session has always read, reaches
 * further on its own: this holds the line the session itself draws.)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  const bare = base.replace(/\.js$/, '');
  for (const c of [`${bare}.ts`, `${bare}.tsx`, path.join(bare, 'index.ts'), path.join(bare, 'index.tsx')]) if (fs.existsSync(c)) return c;
  return null;
}

/** Every module reachable from `entry` by static, value imports (and re-exports); `via` gives the importer that first reached each. */
function reach(entry: string): { files: Map<string, string | null>; packages: Set<string> } {
  const files = new Map<string, string | null>();
  const packages = new Set<string>();
  const stack: [string, string | null][] = [[entry, null]];
  const edge = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'([^']+)'|^\s*import\s+'([^']+)'/gms;
  while (stack.length) {
    const [file, via] = stack.pop()!;
    if (files.has(file)) continue;
    files.set(file, via);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(edge)) {
      const spec = m[1] ?? m[2];
      const next = resolveSpec(file, spec);
      if (next) stack.push([next, file]);
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
    }
  }
  return { files, packages };
}

const chain = (files: Map<string, string | null>, file: string): string => {
  const out: string[] = [];
  for (let f: string | null | undefined = file; f; f = files.get(f)) out.push(path.relative(SRC, f));
  return out.reverse().join(' -> ');
};

describe('the drafting session', () => {
  const { files, packages } = reach(path.join(SRC, 'drafting/session.ts'));

  it('does not reach the issue pipeline or the sheet UI', () => {
    const bad = [...files.keys()].filter((f) => /\/(issue)\//.test(f) || /\/components\/viewer\/(wall|sheets)\//.test(f));
    assert.deepEqual(bad.map((f) => chain(files, f)), []);
  });

  it('does not reach react-dom or the zipper', () => {
    assert.deepEqual([...packages].filter((p) => p === 'react-dom' || p === 'fflate'), []);
  });
});
