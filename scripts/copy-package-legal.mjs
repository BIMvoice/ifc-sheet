/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `prepack` / `postpack` for a published package: copy the repository's
 * LICENSE and NOTICE into the package folder so the tarball carries them
 * (the MPL-2.0 text, and the notice that IfcSheet derives from ifc-lite), and
 * remove the copies afterwards. Run from the package folder by npm/pnpm.
 *
 *   node ../../scripts/copy-package-legal.mjs            copy
 *   node ../../scripts/copy-package-legal.mjs --clean    remove the copies
 */
import { copyFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const clean = process.argv.includes('--clean');
for (const name of ['LICENSE', 'NOTICE']) {
  if (clean) rmSync(resolve(process.cwd(), name), { force: true });
  else copyFileSync(resolve(root, name), resolve(process.cwd(), name));
}
