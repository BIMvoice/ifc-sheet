#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `ifcsheet` executable: see `cli.ts`. */

import { fileURLToPath } from 'node:url';
import { CHILD_MARK, needsRoom, runGuarded } from './heap-guard.js';

const args = process.argv.slice(2);
const inChild = process.env[CHILD_MARK] !== undefined;
// The mark is for this process only: processes the command starts must not inherit it.
delete process.env[CHILD_MARK];
// `build` runs in a child with room for a large model, and a memory abort there is worded and exit 1 here (#616); other commands run here.
process.exitCode = inChild || !needsRoom(args) ? await (await import('./cli.js')).run(args) : await runGuarded(fileURLToPath(import.meta.url), args);
