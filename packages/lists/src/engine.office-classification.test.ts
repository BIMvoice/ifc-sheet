/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The `officeClassification` column source (#351): the engine asks the provider, picks Code or Title, and groups by it. */

import { describe, it, expect } from 'vitest';
import { IfcTypeEnum } from '@ifc-lite/data';
import { executeList } from './engine.js';
import type { ListDataProvider, ListDefinition } from './types.js';

const CODES: Record<number, { code: string; title: string } | null> = { 1: { code: 'C-1', title: 'One' }, 2: { code: 'C-1', title: 'One' }, 3: { code: 'C-2', title: '' }, 4: null };
const asked: Array<[number, string | undefined]> = [];
const provider = (withAccessor: boolean): ListDataProvider => ({
  getEntitiesByType: (type) => (type === IfcTypeEnum.IfcWall ? [1, 2, 3, 4] : []),
  getEntityName: (id) => `W${id}`, getEntityGlobalId: () => '', getEntityDescription: () => '', getEntityObjectType: () => '', getEntityTag: () => '',
  getEntityTypeName: () => 'IfcWall', getPropertySets: () => [], getQuantitySets: () => [],
  ...(withAccessor ? { getOfficeClassification: (id: number, mappingId?: string) => { asked.push([id, mappingId]); return CODES[id] ?? null; } } : {}),
});
const def = (over: Partial<ListDefinition>): ListDefinition => ({ id: 'd', name: 'D', createdAt: 0, updatedAt: 0, entityTypes: [IfcTypeEnum.IfcWall], groups: [], legacyConditions: [], columns: [], ...over });

describe('officeClassification column', () => {
  it('reads the code by default and the title for propertyName Title; an element with none has an empty cell', () => {
    const r = executeList(def({ columns: [{ id: 'c', source: 'officeClassification', propertyName: 'Code' }, { id: 't', source: 'officeClassification', propertyName: 'Title' }] }), provider(true));
    expect(r.rows.map((x) => x.values)).toEqual([['C-1', 'One'], ['C-1', 'One'], ['C-2', null], [null, null]]);
  });

  it('passes the column\'s mapping id (psetName) to the provider', () => {
    asked.length = 0;
    executeList(def({ columns: [{ id: 'c', source: 'officeClassification', psetName: 'm9', propertyName: 'Code' }] }), provider(true));
    expect(asked.map((a) => a[1])).toEqual(['m9', 'm9', 'm9', 'm9']);
  });

  it('is empty on a provider that does not know the office\'s mappings', () => {
    const r = executeList(def({ columns: [{ id: 'c', source: 'officeClassification', propertyName: 'Code' }] }), provider(false));
    expect(r.rows.every((x) => x.values[0] === null)).toBe(true);
  });

  it('groups by the code', () => {
    const r = executeList(def({
      columns: [{ id: 'c', source: 'officeClassification', propertyName: 'Code' }],
      grouping: { columnId: 'c', columnIds: ['c'], sumColumnIds: [], view: 'schedule' },
    }), provider(true));
    const groups = (r.groups ?? []).filter((g) => g.level === 0).map((g) => [g.label, g.count]).sort();
    expect(groups).toEqual([['(none)', 1], ['C-1', 2], ['C-2', 1]]);
  });
});
