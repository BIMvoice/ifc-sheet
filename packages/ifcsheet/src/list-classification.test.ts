/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The office classification a list provider answers (#351): `classificationOf`, the mapping the column names, the model's own reference first. Codes are EXAMPLEs. */

import { describe, expect, it } from 'vitest';
import type { ClassificationMapping, ClassificationModel } from './classification.js';
import { withOfficeClassification } from './list-classification.js';

const A: ClassificationMapping = { id: 'a', system: { name: 'Uniclass', edition: '2015' }, rules: [{ by: 'type', match: 'T240', code: 'EXAMPLE-A', title: 'EXAMPLE: a' }, { by: 'class', match: 'IfcWall', code: 'EXAMPLE-A-CLASS' }] };
const B: ClassificationMapping = { id: 'b', system: { name: 'Office' }, rules: [{ by: 'type', match: 'T240', code: 'EXAMPLE-B' }] };
const base = {
  getEntityTypeName: (id: number) => (id === 3 ? 'IfcDoor' : 'IfcWallStandardCase'),
  getEntityDefiningTypeName: (id: number) => (id === 1 ? 'T240' : ''),
  getMaterialNames: () => [] as string[],
};
const none: ClassificationModel = { referencesOf: () => [] };
const own: ClassificationModel = { referencesOf: (e) => (e.expressId === 1 ? [{ identification: 'EXAMPLE-OWN', name: 'EXAMPLE: model' }] : []) };

describe('withOfficeClassification', () => {
  it('answers with classificationOf: type rule, then class rule, else null', () => {
    const p = withOfficeClassification(base, 'm', { mappings: [A], model: none });
    expect(p.getOfficeClassification(1)).toEqual({ code: 'EXAMPLE-A', title: 'EXAMPLE: a' });
    expect(p.getOfficeClassification(2)).toEqual({ code: 'EXAMPLE-A-CLASS', title: '' });
    expect(p.getOfficeClassification(3)).toBeNull();
  });

  it('the model\'s own reference wins over the mapping', () => {
    const p = withOfficeClassification(base, 'm', { mappings: [A], model: own });
    expect(p.getOfficeClassification(1)).toEqual({ code: 'EXAMPLE-OWN', title: 'EXAMPLE: model' });
    expect(p.getOfficeClassification(2)?.code).toBe('EXAMPLE-A-CLASS');
  });

  it('takes the mapping the column names, else the first', () => {
    const p = withOfficeClassification(base, 'm', { mappings: [A, B], model: none });
    expect(p.getOfficeClassification(1, 'b')?.code).toBe('EXAMPLE-B');
    expect(p.getOfficeClassification(1)?.code).toBe('EXAMPLE-A');
    expect(p.getOfficeClassification(1, 'nope')).toBeNull();
  });

  it('hands the model id and the express id to the model, and leaves the provider as it was', () => {
    const seen: Array<[string | undefined, number | undefined]> = [];
    const p = withOfficeClassification(base, 'fzk', { mappings: [], model: { referencesOf: (e) => { seen.push([e.modelId, e.expressId]); return []; } } });
    p.getOfficeClassification(7);
    expect(seen).toEqual([['fzk', 7]]);
    expect('getOfficeClassification' in base).toBe(false);
    expect(p.getEntityTypeName(3)).toBe('IfcDoor');
  });
});
