/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The memory guard of the executable (#616): the pieces, and the real `dist/bin.js` run with a heap too small for the model. */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAbortFilter, failureMessage, heapMegabytes, localeOfArgs, needsRoom, userSetHeap } from './heap-guard.js';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const GB = 1024 ** 3;

describe('the heap the child runs with', () => {
  it('is three quarters of the memory up to 16 GB, and none when that is no more than the default', () => {
    expect(heapMegabytes(8 * GB)).toBe(6144);
    expect(heapMegabytes(64 * GB)).toBe(16384);
    expect(heapMegabytes(4 * GB)).toBeUndefined();
  });
  it('is the user\'s own when NODE_OPTIONS or the node arguments set one', () => {
    expect(userSetHeap('--max-old-space-size=512', [])).toBe(true);
    expect(userSetHeap('--max_old_space_size=512', [])).toBe(true);
    expect(userSetHeap(undefined, ['--max-old-space-size=512'])).toBe(true);
    expect(userSetHeap('--trace-warnings', ['--no-warnings'])).toBe(false);
  });
});

describe('which commands get the child', () => {
  it('is build only: the others start without a second Node start', () => {
    expect(needsRoom(['build', 'm.ifc'])).toBe(true);
    expect(needsRoom(['--locale', 'ro', 'build', 'm.ifc'])).toBe(true);
    for (const c of ['check', 'list', 'rooms', 'boq', 'materials', 'classify', '--help']) expect(needsRoom([c, 'm.ifc'])).toBe(false);
  });
});

describe('the abort filter', () => {
  it('bounds the memory of a line that never ends, and still passes it', () => {
    const filter = createAbortFilter();
    const piece = 'x'.repeat(256 * 1024);
    let shown = '';
    for (let i = 0; i < 40; i++) shown += filter.push(piece);
    // Most of it is already out before the end: the filter did not keep it all.
    expect(shown.length).toBeGreaterThan(8 * 1024 * 1024);
    shown += filter.flush();
    expect(shown.length).toBe(40 * piece.length);
    expect(filter.fatal).toBe(false);
  });
  const abort = '[ifc-lite] note\n<--- Last few GCs --->\n[1:0x1] 5 ms: Mark-Compact 40 (44) -> 38 MB\n\n<--- JS stacktrace --->\n\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n----- Native stack trace -----\n 1: 0x1 node::OOMErrorHandler\n';
  it('shows the lines before V8\'s report and holds the report back, whatever the chunking', () => {
    for (const size of [1, 7, abort.length]) {
      const filter = createAbortFilter();
      let shown = '';
      for (let i = 0; i < abort.length; i += size) shown += filter.push(abort.slice(i, i + size));
      shown += filter.flush();
      expect(shown).toBe('[ifc-lite] note\n');
      expect(filter.fatal).toBe(true);
    }
  });
  it('passes everything else, a last line without its newline included', () => {
    const filter = createAbortFilter();
    expect(filter.push('ifcsheet: a\nifcsheet: b')).toBe('ifcsheet: a\n');
    expect(filter.flush()).toBe('ifcsheet: b');
    expect(filter.fatal).toBe(false);
  });
});

describe('the words', () => {
  it('say the model is too large and what to set, in English and Romanian', () => {
    expect(failureMessage('memory', 'en', 4096, 16 * GB)).toBe('ifcsheet: the model is too large for the memory given to it (4096 MB). Run again with NODE_OPTIONS=--max-old-space-size=14592.\n');
    expect(failureMessage('memory', 'ro', 4096, 16 * GB)).toContain('prea mare pentru memoria alocată (4096 MB)');
    expect(failureMessage('memory', 'ro', 4096, 16 * GB)).toContain('NODE_OPTIONS=--max-old-space-size=14592');
  });
  it('say there is no more memory when the computer has no more, and never suggest a smaller setting', () => {
    expect(failureMessage('memory', 'en', 4096, 4 * GB)).toContain('no more to give');
    expect(failureMessage('memory', 'ro', 4096, 4 * GB)).toContain('nu are mai multă');
  });
  it('word an abort that is not a memory one', () => {
    expect(failureMessage('abort', 'en', undefined, 8 * GB)).toContain('stopped abruptly');
    expect(failureMessage('abort', 'ro', undefined, 8 * GB)).toContain('s-a oprit brusc');
  });
  it('take the language from --locale, English otherwise', () => {
    expect(localeOfArgs(['build', 'm.ifc', '--locale', 'ro'])).toBe('ro');
    expect(localeOfArgs(['build', '--locale=ro'])).toBe('ro');
    expect(localeOfArgs(['build', '--locale=xx'])).toBe('en');
    expect(localeOfArgs(['build'])).toBe('en');
  });
});

describe.skipIf(!existsSync(FZK))('the executable with a heap too small for the model', { timeout: 120_000 }, () => {
  const run = (nodeOptions: string, ...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: nodeOptions }, timeout: 120_000 });

  it('exits 1 in words, with no V8 abort report on stderr and nothing on stdout', () => {
    expect(existsSync(BIN), 'dist/bin.js is built (pnpm --filter @bimvoice/ifcsheet build)').toBe(true);
    const out = join(mkdtempSync(join(tmpdir(), 'ifcsheet-heap-')), 's.pdf');
    const result = run('--max-old-space-size=40', 'build', FZK, '--out', out);
    expect(result.status).toBe(1);
    // The user's own heap is set, so no heap number is in the words. The whole of stderr is V8's blank separator line (it comes before the report and passes) and the one line, so no part of the report is in it.
    expect(result.stderr).toBe(`\n${failureMessage('memory', 'en', undefined, totalmem())}`);
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
  });

  it('words it in Romanian with --locale ro', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ifcsheet-heap-')), 's.pdf');
    const result = run('--max-old-space-size=40', 'build', FZK, '--out', out, '--locale', 'ro');
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`\n${failureMessage('memory', 'ro', undefined, totalmem())}`);
  });

  it('builds the same model with the default settings, and passes the child\'s exit code and stdout through', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ifcsheet-heap-')), 's.pdf');
    const built = run('', 'build', FZK, '--out', out);
    expect(built.status).toBe(0);
    // The child's stdout is passed through whole: its last line is the one the command prints, `<path>: <summary>`.
    const lastLine = built.stdout.trimEnd().split('\n').pop() ?? '';
    const [printedPath, summary] = lastLine.split(/: (.*)/s);
    expect(printedPath).toBe(out);
    expect(summary.length).toBeGreaterThan(0);
    expect(readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-');
    expect(run('', 'build').status).toBe(2);
  });
});
