/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The parser and the geometry engine (wasm) report through `console.log` ("[IFC-LITE] Opening classifier: ...").
 * In Node that is stdout, which the command line keeps for what a command prints (`--json`, `--csv`, the tables), so
 * a script that parses it fails on the first log line (#600). While a model is opened, those console methods write
 * to stderr instead: the text is kept, on the channel meant for diagnostics.
 */

const METHODS = ['log', 'info', 'debug'] as const;
let depth = 0;
let saved: Partial<Record<(typeof METHODS)[number], (...args: unknown[]) => void>> = {};

/** Runs `work` with `console.log`, `console.info` and `console.debug` pointed at `console.error`, and restores them after. Safe to nest and to run concurrently. */
export async function withEngineLogOnStderr<T>(work: () => Promise<T>): Promise<T> {
  if (depth++ === 0) {
    saved = {};
    for (const m of METHODS) {
      saved[m] = console[m];
      console[m] = (...args: unknown[]): void => console.error(...args);
    }
  }
  try {
    return await work();
  } finally {
    if (--depth === 0) {
      for (const m of METHODS) if (saved[m]) console[m] = saved[m]!;
      saved = {};
    }
  }
}
