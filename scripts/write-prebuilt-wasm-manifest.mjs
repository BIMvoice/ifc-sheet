/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Write manifest.json beside the runtime files that
 * .github/workflows/prebuilt-wasm.yml publishes to the `prebuilt-wasm` branch.
 *
 * Usage: node scripts/write-prebuilt-wasm-manifest.mjs <dir> <source-commit> <ifc-lite.d.ts>
 */

import { writeManifest } from './lib/prebuilt-wasm.mjs';

const [dir, commit, dtsPath] = process.argv.slice(2);
if (!dir || !commit || !dtsPath) {
  console.error('Usage: node scripts/write-prebuilt-wasm-manifest.mjs <dir> <source-commit> <ifc-lite.d.ts>');
  process.exit(2);
}
console.log(JSON.stringify(writeManifest({ dir, commit, dtsPath }), null, 2));
