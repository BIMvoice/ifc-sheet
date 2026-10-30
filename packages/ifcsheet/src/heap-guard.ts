/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The memory guard of the `ifcsheet` executable (#616). A V8 out-of-memory abort cannot be caught in the process that runs
 * out, so `bin.ts` runs the command in a child process of its own: the child gets a larger heap than Node's default (a
 * large model's meshes and sheets do not fit in it), and when the child dies of an abort the parent says so in words and
 * exits 1, the documented exit code of a failed run, instead of letting V8's "FATAL ERROR" and native stack reach the user.
 */

import { spawn } from 'node:child_process';
import { totalmem } from 'node:os';
import { nameLanguageOf, type NameLanguage } from './names.js';

/** Set in the child, so that it runs the command itself and does not spawn another. */
export const CHILD_MARK = 'IFCSHEET_HEAP_GUARD_CHILD';

const MB = 1024 * 1024;
/** Above Node's default heap on a 64-bit machine (about 4 GB), below what a machine without the memory for it would swap on. */
const DEFAULT_HEAP_MB = 4096;
const CEILING_MB = 16384;

/** Whether `NODE_OPTIONS` (or the command's own node arguments) already set the heap: the user's setting wins, the guard adds none. */
export function userSetHeap(nodeOptions: string | undefined, execArgv: readonly string[]): boolean {
  return /--max[-_]old[-_]space[-_]size/.test(nodeOptions ?? '') || execArgv.some((a) => /^--max[-_]old[-_]space[-_]size/.test(a));
}

/** The `--max-old-space-size` (in MB) the child runs with: three quarters of the machine's memory up to 16 GB, or none when that is not above Node's default. */
export function heapMegabytes(totalBytes: number): number | undefined {
  const mb = Math.min(CEILING_MB, Math.floor((totalBytes * 0.75) / MB / 256) * 256);
  return mb > DEFAULT_HEAP_MB ? mb : undefined;
}

export type Failure = 'memory' | 'abort';

/** The words for a child that died: what happened, and for a memory abort what to do (`NODE_OPTIONS` is the user's to set). */
export function failureMessage(kind: Failure, language: NameLanguage, heapMb: number | undefined, totalBytes: number): string {
  if (kind === 'abort') return language === 'ro'
    ? 'ifcsheet: comanda s-a oprit brusc (eroare internă a procesului Node). Încercați din nou; dacă se repetă, raportați modelul și comanda.\n'
    : 'ifcsheet: the command stopped abruptly (an internal error of the Node process). Try again; if it repeats, report the model and the command.\n';
  const suggest = Math.floor((totalBytes * 0.9) / MB / 256) * 256;
  const limit = heapMb === undefined ? '' : ` (${heapMb} MB)`;
  if (suggest > (heapMb ?? DEFAULT_HEAP_MB)) return language === 'ro'
    ? `ifcsheet: modelul este prea mare pentru memoria alocată${limit}. Rulați din nou cu NODE_OPTIONS=--max-old-space-size=${suggest}.\n`
    : `ifcsheet: the model is too large for the memory given to it${limit}. Run again with NODE_OPTIONS=--max-old-space-size=${suggest}.\n`;
  return language === 'ro'
    ? `ifcsheet: modelul este prea mare pentru memoria alocată${limit}, iar acest calculator nu are mai multă. Rulați pe un calculator cu mai multă memorie.\n`
    : `ifcsheet: the model is too large for the memory given to it${limit}, and this computer has no more to give. Run it on a computer with more memory.\n`;
}

/** `--locale ro|en` from the arguments, English when absent or anything else (the command itself refuses a wrong one). */
export function localeOfArgs(args: readonly string[]): NameLanguage {
  const i = args.findIndex((a) => a === '--locale' || a.startsWith('--locale='));
  const value = i < 0 ? undefined : args[i].includes('=') ? args[i].slice('--locale='.length) : args[i + 1];
  return nameLanguageOf(value) ?? 'en';
}

/**
 * Takes stderr lines in chunks and gives back the ones to show: V8's abort report (the "Last few GCs" block, `FATAL ERROR`
 * and the native stack after it, all from the block's first line on) is held back, and `fatal` says it was met. Every other line passes through as it came.
 */
export function createAbortFilter(): { push: (chunk: string) => string; flush: () => string; readonly fatal: boolean } {
  let rest = '';
  let fatal = false;
  let held = false;
  // From the report's first line to the end, nothing passes: V8 runs its blocks and the native stack together.
  const shown = (line: string): boolean => {
    if (/FATAL ERROR:/.test(line)) fatal = true;
    if (fatal || /^<--- (?:Last few GCs|JS stacktrace) --->/.test(line)) held = true;
    return !held;
  };
  const lines = (text: string): string => text.split('\n').filter(shown).map((l) => `${l}\n`).join('');
  return {
    push(chunk) {
      const all = rest + chunk;
      const cut = all.lastIndexOf('\n');
      if (cut < 0) { rest = all; return ''; }
      rest = all.slice(cut + 1);
      return lines(all.slice(0, cut));
    },
    flush() {
      const last = rest;
      rest = '';
      return last === '' || !shown(last) ? '' : last;
    },
    get fatal() { return fatal; },
  };
}

/** Runs `bin.js` again as a child with the guard's heap, passes its stdout and exit code through, and turns an abort into words and exit 1. */
export function runGuarded(script: string, args: readonly string[]): Promise<number> {
  return new Promise((done) => {
    const total = totalmem();
    const heapMb = userSetHeap(process.env.NODE_OPTIONS, process.execArgv) ? undefined : heapMegabytes(total);
    const child = spawn(process.execPath, [...process.execArgv, ...(heapMb ? [`--max-old-space-size=${heapMb}`] : []), script, ...args], {
      stdio: ['inherit', 'inherit', 'pipe'],
      env: { ...process.env, [CHILD_MARK]: '1' },
    });
    const filter = createAbortFilter();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { process.stderr.write(filter.push(chunk)); });
    // Ctrl-C reaches the child by itself from a terminal; a signal sent to this process alone is passed on, and the child's end ends this process.
    const forward = (signal: NodeJS.Signals) => () => { child.kill(signal); };
    const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((s) => [s, forward(s)] as const);
    for (const [s, h] of handlers) process.on(s, h);
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      for (const [s, h] of handlers) process.off(s, h);
      process.stderr.write(filter.flush());
      const language = localeOfArgs(args);
      // 134 is how a shell reports SIGABRT; Windows has no signals, and Node there exits with the abort's own code.
      const aborted = signal === 'SIGABRT' || signal === 'SIGKILL' || code === 134 || code === 3221226505;
      if (aborted || filter.fatal) {
        process.stderr.write(failureMessage(filter.fatal ? 'memory' : 'abort', language, heapMb, total));
        done(1);
      } else if (signal) done(128 + (({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as Record<string, number>)[signal] ?? 0));
      else done(code ?? 1);
    };
    child.on('error', (error) => {
      for (const [s, h] of handlers) process.off(s, h);
      process.stderr.write(`ifcsheet: cannot start the command: ${error.message}\n`);
      done(1);
    });
    child.on('close', finish);
  });
}
