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
    expect(Object.keys(READINESS_EN)).toHaveLength(30);
  });
});

describe('the far-away elements finding (#268)', () => {
  const far = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Marker ${i + 1}`, distance: 100 + i }));

  it('names each element with its distance, after the model\'s own gaps', () => {
    const found = modelReadiness({ ...COMPLETE, duplicateGlobalIds: 1, duplicatedEntities: 2, farElements: [{ label: 'NUS - 0,0 - Kake', distance: 108.3 }, { label: 'IfcBuildingElementProxy 1cHGmPSXzFhOqVxhbE1HnR', distance: 7.46 }] });
    expect(found.map((f) => f.kind)).toEqual(['duplicateGlobalIds', 'farElements']);
    expect(found[1].params).toEqual({ count: 2, distance: '108 m', list: "'NUS - 0,0 - Kake' (108 m), 'IfcBuildingElementProxy 1cHGmPSXzFhOqVxhbE1HnR' (7.5 m)" });
    expect(describeReadiness(found[1]).missing).toBe("2 elements lie up to 108 m from the building: 'NUS - 0,0 - Kake' (108 m), 'IfcBuildingElementProxy 1cHGmPSXzFhOqVxhbE1HnR' (7.5 m).");
  });

  it('is absent when there are none, or when none were looked for', () => {
    expect(kinds({})).toEqual([]);
    expect(kinds({ farElements: [] })).toEqual([]);
  });

  it('names the first eight and counts the rest', () => {
    const [finding] = modelReadiness({ ...COMPLETE, farElements: far(11) });
    expect(finding.params.count).toBe(11);
    expect(String(finding.params.list).split("), '")).toHaveLength(8);
    expect(String(finding.params.list)).toMatch(/\(107 m\), … \+3$/);
  });
});
