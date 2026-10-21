/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The model-side findings (#105, moved to the engine by #164): each present when the model lacks the thing, absent when it has it. */

import { describe, expect, it } from 'vitest';
import { READINESS_EN, describeReadiness, modelReadiness, type ModelFacts, type ReadinessKind } from './readiness.js';

/** A model with everything the set reads. */
const COMPLETE: ModelFacts = { storeys: 2, spaces: 5, elements: 100, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };
const kinds = (f: Partial<ModelFacts>): ReadinessKind[] => modelReadiness({ ...COMPLETE, ...f }).map((x) => x.kind);

describe('modelReadiness', () => {
  it('has nothing to say about a complete model or an empty one', () => {
    expect(kinds({})).toEqual([]);
    expect(modelReadiness({ ...COMPLETE, storeys: 0, spaces: 0, elements: 0 })).toEqual([]);
  });

  it('reports each thing the model lacks, with counts', () => {
    expect(kinds({ storeys: 0 })).toEqual(['noStoreys']);
    expect(kinds({ spaces: 0 })).toEqual(['noSpaces']);
    const only = (f: Partial<ModelFacts>) => modelReadiness({ ...COMPLETE, ...f }).map((x) => [x.kind, x.params]);
    expect(only({ elementsWithoutStorey: 7 })).toEqual([['noStorey', { count: 7, total: 100 }]]);
    expect(only({ elementsWithoutMaterial: 36 })).toEqual([['noMaterials', { count: 36, total: 100 }]]);
    expect(only({ elementsWithoutQuantities: 15 })).toEqual([['noQuantities', { count: 15, total: 100 }]]);
    expect(only({ duplicateGlobalIds: 2, duplicatedEntities: 5 })).toEqual([['duplicateGlobalIds', { count: 2, entities: 5 }]]);
  });

  it('does not ask for materials or quantities of a model with no elements', () => {
    expect(kinds({ elements: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, storeys: 1 })).toEqual([]);
  });

  it('lists several findings in the order the set depends on them', () => {
    expect(kinds({ storeys: 0, spaces: 0, elementsWithoutStorey: 1, elementsWithoutMaterial: 1, elementsWithoutQuantities: 1, duplicateGlobalIds: 1, duplicatedEntities: 2 }))
      .toEqual(['noStoreys', 'noSpaces', 'noStorey', 'noMaterials', 'noQuantities', 'duplicateGlobalIds']);
  });
});

describe('describeReadiness', () => {
  it('says, for every finding, what is missing and what is weaker, in English with the counts filled in', () => {
    const all = modelReadiness({ storeys: 0, spaces: 0, elements: 10, elementsWithoutStorey: 3, elementsWithoutMaterial: 4, elementsWithoutQuantities: 5, duplicateGlobalIds: 1, duplicatedEntities: 2 });
    expect(all).toHaveLength(6);
    for (const f of all) {
      const { missing, effect } = describeReadiness(f);
      expect(missing, f.kind).not.toMatch(/^ready\.|\{/);
      expect(effect, f.kind).not.toMatch(/^ready\.|\{/);
    }
    expect(describeReadiness(all[3]).missing).toBe('4 of 10 elements have no material.');
    expect(Object.keys(READINESS_EN)).toHaveLength(12);
  });
});
