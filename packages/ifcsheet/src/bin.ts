#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `ifcsheet` executable: see `cli.ts`. */

import { fileURLToPath } from 'node:url';
import { CHILD_MARK, runGuarded } from './heap-guard.js';

// The command runs in a child with room for a large model, and a memory abort there is worded and exit 1 here (#616).
process.exitCode = process.env[CHILD_MARK] ? await (await import('./cli.js')).run(process.argv.slice(2)) : await runGuarded(fileURLToPath(import.meta.url), process.argv.slice(2));
