#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `ifcsheet` executable: see `cli.ts`. */

import { fileURLToPath } from 'node:url';
import { CHILD_MARK, needsRoom, runGuarded } from './heap-guard.js';

// The parser and the geometry engine (wasm) report through `console.log`, which in Node is stdout: the channel `--json`,
// `--csv` and the tables use (#600). This executable owns its process, so it points those methods at stderr here, once, in whichever process runs the
// command (here for most commands, the child for a guarded `build`), and the library (`openModel`, the MCP server, the app) leaves `console` alone.
for (const method of ['log', 'info', 'debug'] as const) console[method] = (...args: unknown[]): void => console.error(...args);

const args = process.argv.slice(2);
const inChild = process.env[CHILD_MARK] !== undefined;
// The mark is for this process only: processes the command starts must not inherit it.
delete process.env[CHILD_MARK];
// `build` runs in a child with room for a large model, and a memory abort there is worded and exit 1 here (#616); other commands run here.
process.exitCode = inChild || !needsRoom(args) ? await (await import('./cli.js')).run(args) : await runGuarded(fileURLToPath(import.meta.url), args);

