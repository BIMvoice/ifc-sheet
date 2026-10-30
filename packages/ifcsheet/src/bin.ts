#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `ifcsheet` executable: see `cli.ts`. */

import { run } from './cli.js';

// The parser and the geometry engine (wasm) report through `console.log`, which in Node is stdout: the channel `--json`,
// `--csv` and the tables use (#600). This executable owns its process, so it points those methods at stderr here, once,
// and the library (`openModel`, the MCP server, the app) leaves `console` alone.
for (const method of ['log', 'info', 'debug'] as const) console[method] = (...args: unknown[]): void => console.error(...args);

process.exitCode = await run(process.argv.slice(2));
