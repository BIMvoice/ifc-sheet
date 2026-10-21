/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model-readiness findings of AC20-FZK-Haus (#164): the same facts and findings
 * the app's own test pins (`apps/viewer/src/check/readiness-read.test.ts`), which
 * reads the same file through the same code.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openModel } from './headless.js';
import { readModelFacts, readinessOfModel } from './readiness-read.js';
import { modelReadiness } from './readiness.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus readiness test: ${missing}`);

describe.skipIf(missing !== null)('the readiness of AC20-FZK-Haus', () => {
  it('counts two storeys, seven rooms, 82 elements, four of them without a material, and reports just that', async () => {
    // No wasm needed: the counts read the entity tables, not the meshes.
    const model = await openModel(new Uint8Array(readFileSync(FZK)), { geometry: false });
    const facts = readModelFacts([{ store: model.dataStore, storeys: model.storeys.length }]);
    expect(facts).toEqual({ storeys: 2, spaces: 7, elements: 82, elementsWithoutStorey: 0, elementsWithoutMaterial: 4, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 });
    const findings = readinessOfModel(model);
    expect(findings).toEqual(modelReadiness(facts));
    expect(findings.map((f) => [f.kind, f.params])).toEqual([['noMaterials', { count: 4, total: 82 }]]);
  }, 120_000);
});
