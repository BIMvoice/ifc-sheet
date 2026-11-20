/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #830: two models loaded, a door draws one symbol. AC20-FZK-Haus is federated with a copy of itself the way the viewer federates
 * (`loadFederated`: each file parsed and meshed, re-homed onto the federation's id space, the frames converged), the worst case of
 * the report: every door and window held twice, at the same place. Each plan's symbols, made as a tab and a sheet make them
 * (`viewOpeningSymbols` over the federated meshes), are counted per GlobalId and against FZK alone. The rule is the engine's
 * (`opening-owners.ts`).
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { useViewerStore } from '@/store';
import { drawView, federatedMeshes, loadFederated, WASM_BUILT } from '@/test/federated-pair';
import { useProjectStore } from './project-store';
import { viewOpeningSymbols } from './view-symbols';

const FZK = fileURLToPath(new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const skip = WASM_BUILT ? false : 'wasm runtime not built (pnpm build:wasm or pnpm build:wasm:fetch)';

/** Every plan's door and window symbols, as `plan name -> GlobalId -> how many symbols`. */
async function symbolsPerDoor(copies: number): Promise<Map<string, Map<string, number>>> {
  const bytes = new Uint8Array(readFileSync(FZK));
  await loadFederated(Array.from({ length: copies }, (_, i) => ({ id: `fzk${i}`, name: 'AC20-FZK-Haus.ifc', bytes })));
  const out = new Map<string, Map<string, number>>();
  for (const view of useProjectStore.getState().views) {
    if (view.kind !== 'plan') continue;
    const drawing = await drawView(view);
    const s = useViewerStore.getState();
    const counts = new Map<string, number>();
    for (const symbol of viewOpeningSymbols(federatedMeshes(), drawing.config.plane, undefined, new Set(), 'fine', view.level)) {
      const ref = s.resolveGlobalIdFromModels(symbol.id);
      const guid = ref ? s.models.get(ref.modelId)?.ifcDataStore?.entities?.getGlobalId(ref.expressId) : undefined;
      assert.ok(guid, `symbol ${symbol.id} resolves to a model's element`);
      counts.set(guid, (counts.get(guid) ?? 0) + 1);
    }
    out.set(view.name, counts);
  }
  return out;
}

describe('a door draws one symbol when AC20-FZK-Haus is federated with itself (#830)', { skip }, () => {
  it('each plan draws the doors and windows FZK alone draws, each once', async () => {
    const alone = await symbolsPerDoor(1);
    const twice = await symbolsPerDoor(2);
    const doors = [...alone.values()].reduce((n, m) => n + m.size, 0);
    assert.ok(doors > 10, `FZK's plans draw its doors and windows (${doors})`);
    for (const [plan, counts] of alone) assert.ok([...counts.values()].every((n) => n === 1), `${plan}: one symbol per element alone`);
    // Before #830 each element of the federated pair drew two symbols, one per model.
    assert.deepEqual(twice, alone);
  });
});
