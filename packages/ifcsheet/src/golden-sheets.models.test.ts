/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The golden-sheet benchmark (#363). Each public model's starting drawing set
 * is regenerated headlessly and its digest (`golden-digest.ts`) compared with
 * the accepted one in `benchmark/accepted/<model>.json`. A difference fails
 * with one line per changed field naming the sheet. An intended change
 * rewrites the accepted files in the same pull request:
 * `pnpm --filter @bimvoice/ifcsheet benchmark:update`.
 *
 * AC20-FZK-Haus and bloc-p4 are in the repository. More models can be added
 * without committing them: `IFCSHEET_BENCHMARK_MODELS=skolebygg=/path/a.ifc,duplex=/path/b.ifc`
 * (their accepted files are written by `benchmark:update`; CI does not set it).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './index.js';
import { openModel, sheetGraphics } from './headless.js';
import { digestModel } from './golden-digest.js';
import { diffDigests } from './golden-diff.js';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const ACCEPTED = here('../benchmark/accepted/');
const UPDATE = process.env.IFCSHEET_BENCHMARK_UPDATE === '1';
const WASM = here('../../wasm/pkg/ifc-lite_bg.wasm');

const MODELS: Record<string, string> = {
  'ac20-fzk-haus': here('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc'),
  'bloc-p4': here('../../../apps/viewer/public/samples/bloc-p4.ifc'),
  ...Object.fromEntries((process.env.IFCSHEET_BENCHMARK_MODELS ?? '').split(',').filter(Boolean).map((pair) => {
    const at = pair.indexOf('=');
    return [pair.slice(0, at), pair.slice(at + 1)] as const;
  })),
};

// Without the wasm bundle nothing can run. Locally that is a skip with a reason; in CI it is a failure, so the gate cannot go absent unseen.
const noWasm = !existsSync(WASM) && !process.env.CI;
if (noWasm) console.warn('[ifcsheet] skipping the golden-sheet benchmark: wasm bundle not built (`pnpm build:wasm:fetch`)');

describe.skipIf(noWasm)('golden sheets: the accepted drawing sets (#363)', () => {
  for (const [name, file] of Object.entries(MODELS)) {
    it(`${name}: every sheet is as accepted`, async () => {
      const model = await openModel(new Uint8Array(readFileSync(file)));
      // A fixed clock: the title block's date is the only time the set reads.
      const set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
      if (!set) throw new Error(`${name}: no set: the model has no extent`);
      const digest = digestModel(model, set.document, await sheetGraphics(set, model));
      const accepted = `${ACCEPTED}${name}.json`;
      const text = `${JSON.stringify(digest, null, 1)}\n`;
      if (UPDATE) {
        mkdirSync(ACCEPTED, { recursive: true });
        writeFileSync(accepted, text);
        return;
      }
      if (!existsSync(accepted)) expect.fail(`${name}: no accepted set at benchmark/accepted/${name}.json. Run \`pnpm --filter @bimvoice/ifcsheet benchmark:update\` and commit it.`);
      const diff = diffDigests(JSON.parse(readFileSync(accepted, 'utf8')), JSON.parse(text));
      if (diff.length) {
        expect.fail([
          `${name}: ${diff.length} difference(s) from the accepted drawing set (old -> new):`,
          ...diff.map((line) => `  ${line}`),
          'If the change is intended, run `pnpm --filter @bimvoice/ifcsheet benchmark:update` and commit the benchmark/accepted/ diff.',
        ].join('\n'));
      }
    }, 300_000);
  }
});
