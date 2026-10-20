/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/');
const BUILT_SIBLING = new RegExp(
  `^${repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}packages/[^/]+/(dist|pkg)/`,
);

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Many tests here mesh real IFC models through the wasm engine; on a shared
    // CI runner they take longer than vitest's 5 s default without being stuck.
    testTimeout: 30_000,
    server: { deps: { external: [BUILT_SIBLING] } },
  },
  resolve: {
    alias: {
      // parquet-wasm is dynamically imported by @ifc-lite/export and never
      // exercised in MCP unit tests; alias to a no-op so Vite can resolve.
      'parquet-wasm': '/dev/null',
    },
  },
});
