/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Quantities by type: grouping on synthetic elements, the Qto names per class, and the FZK-Haus wall types against their own Qto sums. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QuantityType, RelationshipType, type QuantitySet } from '@ifc-lite/data';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { elementTypeQuantities, typeQuantities, type TypeElement } from './type-quantities';
import { collectTypeElements } from './type-quantities-models';
import { typeQuantitiesCsv, typeQuantityLines, type TypeQuantityLabels } from './type-quantities-layout';

const LABELS: TypeQuantityLabels = {
  title: 'Quantities', type: 'Type', class: 'Class', level: 'Storey', count: 'Count', length: 'Length m', area: 'Area m²', volume: 'Volume m³',
  noQto: 'No Qto', total: 'Total', noType: '(no type)', noLevel: 'No storey',
};

const el = (p: Partial<TypeElement>): TypeElement => ({ className: 'IfcWall', typeClass: 'IfcWallType', typeName: 'W1', level: 'L0', elevation: 0, length: null, area: null, volume: null, ...p });

describe('typeQuantities', () => {
  it('groups by type, per level and in total, and sums only what the elements state', () => {
    const out = typeQuantities([
      el({ length: 2, area: 5, volume: 1 }),
      el({ length: 3, area: 7, volume: 2 }),
      el({ level: 'L1', elevation: 3, length: 4, area: 1, volume: 0.5 }),
      el({ typeName: 'W2', length: 10 }),
      el({ typeName: 'W2', length: null }),
    ]);
    assert.deepEqual(out.levels, ['L0', 'L1']);
    assert.deepEqual(out.rows.map((r) => [r.typeName, r.total.count]), [['W1', 3], ['W2', 2]]);
    const [w1, w2] = out.rows;
    assert.deepEqual(w1.total, { count: 3, noQto: 0, length: 9, area: 13, volume: 3.5 });
    assert.deepEqual(w1.byLevel.L0, { count: 2, noQto: 0, length: 5, area: 12, volume: 3 });
    assert.deepEqual(w1.byLevel.L1, { count: 1, noQto: 0, length: 4, area: 1, volume: 0.5 });
    // A figure nobody states stays empty, not zero; the element with nothing is counted and noted.
    assert.deepEqual(w2.total, { count: 2, noQto: 1, length: 10, area: null, volume: null });
  });

  it('groups the elements with no type by their class, after the typed ones, and keeps a class apart from a type of the same name', () => {
    const out = typeQuantities([
      el({ className: 'IfcSlab', typeClass: null, typeName: null, area: 4 }),
      el({ className: 'IfcSlab', typeClass: null, typeName: null, area: 6 }),
      el({ className: 'IfcColumn', typeClass: null, typeName: null }),
      el({ className: 'IfcSlab', typeClass: 'IfcSlabType', typeName: 'Basic', area: 1 }),
      el({ className: 'IfcWall', typeClass: 'IfcWallType', typeName: 'Basic', area: 2 }),
    ]);
    assert.deepEqual(out.rows.map((r) => [r.className, r.typeName, r.total.count, r.total.area]), [
      ['IfcSlabType', 'Basic', 1, 1], ['IfcWallType', 'Basic', 1, 2], ['IfcColumn', null, 1, null], ['IfcSlab', null, 2, 10],
    ]);
    assert.equal(out.rows[2].total.noQto, 1);
  });

  it('orders levels by elevation with the elements on no storey last, whatever order they arrive in', () => {
    const out = typeQuantities([el({ level: '', elevation: null }), el({ level: 'Roof', elevation: 6 }), el({ level: 'Ground', elevation: 0 }), el({ level: 'Roof', elevation: 6 })]);
    assert.deepEqual(out.levels, ['Ground', 'Roof', '']);
  });

  it('lists a line per level, a total line for a type on several levels, and a total per class; the CSV carries the same lines unformatted', () => {
    const out = typeQuantities([el({ length: 1.5, level: 'L0' }), el({ length: 2, level: 'L1', elevation: 3 }), el({ typeName: '=SUM(A1)', typeClass: 'IfcWallType', length: 1 })]);
    const lines = typeQuantityLines(out, LABELS);
    assert.deepEqual(lines.map((l) => [l.type, l.level, l.totals.count, l.totals.length]), [
      ['=SUM(A1)', 'L0', 1, 1], ['W1', 'L0', 1, 1.5], ['W1', 'L1', 1, 2], ['W1', 'Total', 2, 3.5], ['Total', '', 3, 4.5],
    ]);
    assert.equal(lines.at(-1)!.className, 'IfcWall');
    const csv = typeQuantitiesCsv(out, LABELS).split('\n');
    assert.equal(csv[0], 'Type,Class,Storey,Count,Length m,Area m²,Volume m³,No Qto');
    assert.equal(csv[4], 'W1,IfcWallType,Total,2,3.5,,,0');
    assert.equal(csv[5], 'Total,IfcWall,,3,4.5,,,0');
    assert.ok(csv[1].startsWith("'=SUM(A1)"), csv[1]);
  });

  // Review of #108: one total over every class added door and window areas to wall side areas, and opening volumes on top of walls' NetVolume.
  it('totals each class of element on its own, a StandardCase with its parent class, and never across classes', () => {
    const out = typeQuantities([
      el({ className: 'IfcWallStandardCase', area: 10, volume: 2 }),
      el({ className: 'IfcWall', typeClass: null, typeName: null, area: 5, volume: 1 }),
      el({ className: 'IfcDoor', typeClass: 'IfcDoorType', typeName: 'D1', area: 2 }),
      el({ className: 'IfcSlab', typeClass: 'IfcSlabType', typeName: 'S1', area: 30, volume: 6 }),
    ]);
    assert.deepEqual(out.classTotals.map((c) => [c.className, c.total.count, c.total.area, c.total.volume]), [
      ['IfcDoor', 1, 2, null], ['IfcSlab', 1, 30, 6], ['IfcWall', 2, 15, 3],
    ]);
    const totals = typeQuantityLines(out, LABELS).filter((l) => l.classTotal);
    assert.deepEqual(totals.map((l) => [l.className, l.totals.area]), [['IfcDoor', 2], ['IfcSlab', 30], ['IfcWall', 15]]);
    // No line adds the classes together.
    assert.ok(!typeQuantityLines(out, LABELS).some((l) => l.totals.count === 4), 'no line counts all four elements');
  });
});

const set = (...q: [string, QuantityType, number][]): QuantitySet => ({ name: 'Qto', quantities: q.map(([name, type, value]) => ({ name, type, value })) }) as unknown as QuantitySet;
const SI = { length: 1, area: 1, volume: 1 };

describe('elementTypeQuantities', () => {
  it('prefers the net figure to the gross, by class, and scales to SI', () => {
    const wall = set(['Length', QuantityType.Length, 4000], ['GrossSideArea', QuantityType.Area, 12], ['NetSideArea', QuantityType.Area, 10], ['GrossVolume', QuantityType.Volume, 3], ['NetVolume', QuantityType.Volume, 2.5], ['NetFootprintArea', QuantityType.Area, 99]);
    assert.deepEqual(elementTypeQuantities('IfcWallStandardCase', [wall], { length: 0.001, area: 1, volume: 1 }), { length: 4, area: 10, volume: 2.5 });
    const grossOnly = set(['GrossSideArea', QuantityType.Area, 12], ['GrossVolume', QuantityType.Volume, 3]);
    assert.deepEqual(elementTypeQuantities('IfcWall', [grossOnly], SI), { length: null, area: 12, volume: 3 });
  });

  it('measures a slab by its plan area, a beam by its surface, and never takes a Width or a Height for a length', () => {
    const slab = set(['Width', QuantityType.Length, 9], ['NetArea', QuantityType.Area, 30], ['GrossArea', QuantityType.Area, 32], ['NetSideArea', QuantityType.Area, 77]);
    assert.deepEqual(elementTypeQuantities('IfcSlab', [slab], SI), { length: null, area: 30, volume: null });
    const beam = set(['Length', QuantityType.Length, 5], ['CrossSectionArea', QuantityType.Area, 0.1], ['OuterSurfaceArea', QuantityType.Area, 4], ['NetSurfaceArea', QuantityType.Area, 3.8]);
    assert.deepEqual(elementTypeQuantities('IfcBeam', [beam], SI), { length: 5, area: 3.8, volume: null });
  });

  it('reads a name from any set, and refuses a quantity of the wrong kind', () => {
    const a = set(['Length', QuantityType.Length, 2]);
    const b = set(['NetVolume', QuantityType.Volume, 1], ['NetSideArea', QuantityType.Count, 8]);
    assert.deepEqual(elementTypeQuantities('IfcWall', [a, b], SI), { length: 2, area: null, volume: 1 });
  });
});

describe('FZK-Haus wall types', () => {
  it('total their own Qto sums (computed here from the type -> element relations and the quantity sets)', async () => {
    const store = await parseStep(new Uint8Array(readFileSync(new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
    useViewerStore.setState({ models: new Map([['fzk', { id: 'fzk', name: 'fzk', ifcDataStore: store, visible: true } as never]]) });
    const out = typeQuantities(collectTypeElements());
    const walls = out.rows.filter((r) => r.className === 'IfcWallType');

    // The expectation, independently: walk each IfcWallType's DefinesByType edges and add up the named quantities.
    const expected = new Map<string, { count: number; length: number; area: number; volume: number }>();
    for (const typeId of store.entityIndex.byType.get('IFCWALLTYPE') ?? []) {
      const sum = { count: 0, length: 0, area: 0, volume: 0 };
      for (const edge of store.relationships.forward.getEdges(typeId, RelationshipType.DefinesByType)) {
        const q = new Map<string, number>();
        for (const qs of extractQuantitiesOnDemand(store, edge.target)) for (const x of qs.quantities) q.set(x.name, x.value);
        sum.count += 1;
        sum.length += q.get('Length') ?? 0;
        sum.area += q.get('NetSideArea') ?? 0;
        sum.volume += q.get('NetVolume') ?? 0;
      }
      expected.set(store.entities.getName(typeId), sum);
    }
    assert.deepEqual(walls.map((r) => r.typeName).sort(), [...expected.keys()].sort());
    assert.equal(walls.length, 2);
    for (const r of walls) {
      const want = expected.get(r.typeName!)!;
      assert.equal(r.total.count, want.count);
      assert.equal(r.total.noQto, 0);
      assert.ok(Math.abs(r.total.length! - want.length) < 1e-9, `${r.typeName} length ${r.total.length} vs ${want.length}`);
      assert.ok(Math.abs(r.total.area! - want.area) < 1e-9, `${r.typeName} area ${r.total.area} vs ${want.area}`);
      assert.ok(Math.abs(r.total.volume! - want.volume) < 1e-9, `${r.typeName} volume ${r.total.volume} vs ${want.volume}`);
      // The levels add up to the total.
      const perLevel = Object.values(r.byLevel);
      assert.equal(perLevel.reduce((s, t) => s + t.count, 0), r.total.count);
      assert.ok(Math.abs(perLevel.reduce((s, t) => s + (t.volume ?? 0), 0) - r.total.volume!) < 1e-9);
    }
    // No column for 'no storey': in FZK-Haus only the IfcSite and the 17 openings had none, and neither is listed (#108 review).
    assert.deepEqual(out.levels, ['Erdgeschoss', 'Dachgeschoss']);
  });
});
