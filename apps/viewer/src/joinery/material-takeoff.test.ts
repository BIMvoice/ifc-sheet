/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff: quantities come from the model's Qto sets, scaled to
 * SI; a layered element shares them by layer thickness; one row per material.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MaterialInfo } from '@ifc-lite/parser';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import { csvLines, tableCsv } from './export-test-util.js';
import { elementQuantities, materialShares, takeoffRows, layoutMaterialTakeoff, takeoffTable } from '@bimvoice/ifcsheet';

const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const LABELS = { locale: 'en', title: 'Materials', material: 'Material', elements: 'Elements', volume: 'Volume m³', area: 'Area m²', usedIn: 'Used in', total: 'Total' };

describe('materialShares', () => {
  it('shares a layer set by layer thickness', () => {
    const wall: MaterialInfo = { type: 'MaterialLayerSet', layers: [{ materialName: 'Brick', thickness: 240 }, { materialName: 'Insulation', thickness: 100 }, { materialName: 'Plaster', thickness: 20 }] };
    const shares = Object.fromEntries(materialShares([wall]).map((s) => [s.name, s.share]));
    near(shares.Brick, 240 / 360);
    near(shares.Insulation, 100 / 360);
    near(shares.Plaster, 20 / 360);
  });

  it('shares a constituent set by its fractions, a list evenly, a single material whole', () => {
    assert.deepEqual(materialShares([{ type: 'MaterialConstituentSet', constituents: [{ materialName: 'Glass', fraction: 0.8 }, { materialName: 'Aluminium', fraction: 0.2 }] }]),
      [{ name: 'Glass', share: 0.8 }, { name: 'Aluminium', share: 0.2 }]);
    assert.deepEqual(materialShares([{ type: 'MaterialList', materials: [{ name: 'A' }, { name: 'B' }] }]), [{ name: 'A', share: 0.5 }, { name: 'B', share: 0.5 }]);
    assert.deepEqual(materialShares([{ type: 'Material', name: ' Concrete ' }]), [{ name: 'Concrete', share: 1 }]);
  });

  it('leaves out unnamed parts and an element with no material', () => {
    assert.deepEqual(materialShares([]), []);
    assert.deepEqual(materialShares([{ type: 'Material', name: '  ' }]), []);
  });
});

describe('elementQuantities', () => {
  const qset = (quantities: { name: string; type: QuantityType; value: number }[]): QuantitySet[] => [{ name: 'Qto_WallBaseQuantities', quantities }];

  it('prefers net over gross and scales a millimetre model to SI', () => {
    const q = elementQuantities(qset([
      { name: 'GrossVolume', type: QuantityType.Volume, value: 3e9 },
      { name: 'NetVolume', type: QuantityType.Volume, value: 2.5e9 },
      { name: 'NetSideArea', type: QuantityType.Area, value: 1e7 },
    ]), { volume: 1e-9, area: 1e-6 });
    near(q.volume, 2.5);
    near(q.area, 10);
  });

  it('says nothing when the model states nothing', () => {
    assert.deepEqual(elementQuantities([], { volume: 1, area: 1 }), { volume: null, area: null });
  });
});

describe('takeoffRows', () => {
  const rows = takeoffRows([
    { className: 'IfcWall', materials: [{ name: 'Brick', share: 0.75 }, { name: 'Plaster', share: 0.25 }], volume: 4, area: 10 },
    { className: 'IfcSlab', materials: [{ name: 'Concrete', share: 1 }], volume: 12, area: 40 },
    { className: 'IfcWall', materials: [{ name: 'Brick', share: 1 }], volume: null, area: 5 },
  ]);

  it('sums each material over the elements, by its share, largest volume first', () => {
    assert.deepEqual(rows.map((r) => r.material), ['Concrete', 'Brick', 'Plaster']);
    const brick = rows.find((r) => r.material === 'Brick');
    assert.equal(brick?.elements, 2);
    near(brick?.volume ?? null, 3);
    near(brick?.area ?? null, 12.5);
    assert.deepEqual(brick?.classes, ['IfcWall']);
  });

  it('lays out as a table with a header, a row per material and a total', () => {
    const layout = layoutMaterialTakeoff(rows, LABELS);
    const texts = layout.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    for (const t of ['Materials', 'Material', 'Concrete', 'Brick', 'Plaster', 'Total', '16.00']) assert.ok(texts.includes(t), `${t} on the table`);
    assert.ok(layout.width > 0 && layout.height > 0);
  });

  it('guards a material name against spreadsheet formulas in the CSV (#1506)', () => {
    const csv = tableCsv(takeoffTable(takeoffRows([{ className: 'IfcWall', materials: [{ name: '=HYPERLINK("x")', share: 1 }], volume: 1, area: null }]), LABELS));
    assert.ok(!csvLines(csv)[1].startsWith('='), csv);
  });
});
