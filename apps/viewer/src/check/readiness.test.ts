/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The model-side findings: each present when the model lacks the thing, absent when it has it. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { modelReadiness, type ModelFacts, type ReadinessKind } from './readiness.js';
import { describeEffect, describeMissing } from './readiness-say.js';

/** A model with everything the set reads. */
const COMPLETE: ModelFacts = { storeys: 2, spaces: 5, elements: 100, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };
const kinds = (f: Partial<ModelFacts>): ReadinessKind[] => modelReadiness({ ...COMPLETE, ...f }).map((x) => x.kind);

describe('modelReadiness', () => {
  it('has nothing to say about a complete model', () => assert.deepEqual(kinds({}), []));
  it('has nothing to say about an empty one', () => assert.deepEqual(modelReadiness({ ...COMPLETE, storeys: 0, spaces: 0, elements: 0 }), []));

  it('reports no storeys', () => assert.deepEqual(kinds({ storeys: 0 }), ['noStoreys']));
  it('reports no spaces', () => assert.deepEqual(kinds({ spaces: 0 }), ['noSpaces']));
  it('reports elements on no storey, with counts', () => {
    const [f] = modelReadiness({ ...COMPLETE, elementsWithoutStorey: 7 });
    assert.deepEqual([f.kind, f.params], ['noStorey', { count: 7, total: 100 }]);
  });
  it('reports elements without a material, with counts', () => {
    const [f] = modelReadiness({ ...COMPLETE, elementsWithoutMaterial: 36 });
    assert.deepEqual([f.kind, f.params], ['noMaterials', { count: 36, total: 100 }]);
  });
  it('reports elements without a quantity set, with counts', () => {
    const [f] = modelReadiness({ ...COMPLETE, elementsWithoutQuantities: 15 });
    assert.deepEqual([f.kind, f.params], ['noQuantities', { count: 15, total: 100 }]);
  });
  it('reports shared GlobalIds, with counts', () => {
    const [f] = modelReadiness({ ...COMPLETE, duplicateGlobalIds: 2, duplicatedEntities: 5 });
    assert.deepEqual([f.kind, f.params], ['duplicateGlobalIds', { count: 2, entities: 5 }]);
  });
  it('does not ask for materials or quantities of a model with no elements', () => {
    assert.deepEqual(kinds({ elements: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, storeys: 1 }), []);
  });
  it('lists several findings in the order the set depends on them', () => {
    assert.deepEqual(kinds({ storeys: 0, spaces: 0, elementsWithoutStorey: 1, elementsWithoutMaterial: 1, elementsWithoutQuantities: 1, duplicateGlobalIds: 1, duplicatedEntities: 2 }),
      ['noStoreys', 'noSpaces', 'noStorey', 'noMaterials', 'noQuantities', 'duplicateGlobalIds']);
  });
  it('names, for every finding, what is missing and the feature that is weaker, in words', () => {
    const all = modelReadiness({ storeys: 0, spaces: 0, elements: 10, elementsWithoutStorey: 3, elementsWithoutMaterial: 4, elementsWithoutQuantities: 5, duplicateGlobalIds: 1, duplicatedEntities: 2 });
    assert.equal(all.length, 6);
    for (const f of all) {
      assert.doesNotMatch(describeMissing(f), /^ready\.|\{/, `${f.kind} says what is missing`);
      assert.doesNotMatch(describeEffect(f), /^ready\.|\{/, `${f.kind} says what is weaker`);
    }
    assert.match(describeMissing(all[3]), /^4 of 10 elements have no material/);
  });
});
