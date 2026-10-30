/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff and the quantities by type on a model without Qto sets
 * (#74), through the real pipeline (parser, wasm geometry, the store): a copy
 * of AC20-FZK-Haus with every IfcElementQuantity unlinked. Its wall and slab
 * volumes and areas come back measured from geometry, marked as such, and
 * within 1% of what the untouched model declares; the untouched model keeps
 * its declared figures and marks nothing.
 */

import '@/test/setup-dom.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { collectTakeoffElements } from './material-takeoff-models';
import { takeoffRows, type TakeoffElement } from './material-takeoff';
import { layoutMaterialTakeoff } from './material-takeoff-layout';
import { loadedScheduleModels } from './schedule-models';
import { collectTypeElements } from './type-quantities-models';
import { typeQuantities, type TypeElement } from './type-quantities';

/** The model's text without the links from its elements to their quantity sets. */
function withoutQto(text: string): string {
  const qto = new Set([...text.matchAll(/^#(\d+)=\s*IFCELEMENTQUANTITY\(/gm)].map((m) => m[1]));
  return text.split('\n').filter((line) => {
    const rel = /^#\d+=\s*IFCRELDEFINESBYPROPERTIES\(.*,#(\d+)\);/.exec(line);
    return !(rel && qto.has(rel[1]));
  }).join('\n');
}

const noInstancing = () => undefined;
const sum = (xs: readonly (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
const LABELS = {
  locale: 'en' as const, title: 'Materials', material: 'Material', elements: 'Elements', volume: 'Volume m³', area: 'Area m²', usedIn: 'Used in', total: 'Total',
  measured: { note: 'MEASURED NOTE', unmeasured: (n: number) => `UNMEASURED ${n}`, column: 'Measured', volume: 'volume', area: 'area' },
};

describe('takeoffs of FZK-Haus without its Qto sets (#74)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let dir: string;
  let declared: { types: TypeElement[]; takeoff: TakeoffElement[] };
  let measured: { types: TypeElement[]; takeoff: TakeoffElement[] };

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    declared = { types: collectTypeElements(undefined, loadedScheduleModels({ instanced: noInstancing })), takeoff: collectTakeoffElements(loadedScheduleModels({ instanced: noInstancing })) };
    dir = mkdtempSync(join(tmpdir(), 'fzk-no-qto-'));
    const stripped = join(dir, 'AC20-FZK-Haus-no-qto.ifc');
    const text = readFileSync(FZK_HAUS, 'utf8');
    writeFileSync(stripped, withoutQto(text));
    assert.ok(withoutQto(text).length < text.length, 'quantity sets were unlinked');
    await loadPlanModel(stripped);
    measured = { types: collectTypeElements(undefined, loadedScheduleModels({ instanced: noInstancing })), takeoff: collectTakeoffElements(loadedScheduleModels({ instanced: noInstancing })) };
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const walls = (es: readonly TypeElement[]) => es.filter((e) => e.className === 'IfcWallStandardCase');
  const slabs = (es: readonly TypeElement[]) => es.filter((e) => e.className === 'IfcSlab');

  it('states nothing once the quantity sets are unlinked, and measures every wall and slab', () => {
    for (const e of [...walls(measured.types), ...slabs(measured.types)]) {
      assert.equal(e.volumeSource, 'measured');
      assert.equal(e.areaSource, 'measured');
      assert.equal(e.length, null, 'length is never measured');
    }
    assert.equal(walls(measured.types).length, 13);
    assert.equal(slabs(measured.types).length, 4);
  });

  it('gives wall and slab volumes within 1% of the declared ones, element by element and in total', () => {
    for (const pick of [walls, slabs]) {
      const d = pick(declared.types), m = pick(measured.types);
      assert.equal(d.length, m.length);
      // Same model, same order of elements.
      d.forEach((e, i) => assert.ok(Math.abs(m[i].volume! / e.volume! - 1) < 0.01, `${e.className} ${e.level}: ${m[i].volume} m³ against ${e.volume}`));
      const total = sum(m.map((e) => e.volume)) / sum(d.map((e) => e.volume)) - 1;
      assert.ok(Math.abs(total) < 0.01, `total off by ${total}`);
    }
    // Slab top areas too.
    slabs(declared.types).forEach((e, i) => assert.ok(Math.abs(slabs(measured.types)[i].area! / e.area! - 1) < 0.01));
  });

  it('keeps the declared figures of the untouched model and marks none of them measured', () => {
    for (const e of [...walls(declared.types), ...slabs(declared.types)]) {
      assert.equal(e.volumeSource, 'declared');
      assert.equal(e.areaSource, 'declared');
    }
    const rows = takeoffRows(declared.takeoff);
    assert.ok(rows.every((r) => !r.measuredVolume && !r.measuredArea));
    const texts = layoutMaterialTakeoff(rows, LABELS).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(!texts.some((t) => t.endsWith(' *') || t.includes('MEASURED NOTE')), 'nothing marked, no note');
  });

  it('marks the measured figures on the takeoff sheet and explains them', () => {
    const rows = takeoffRows(measured.takeoff);
    assert.ok(rows.some((r) => r.measuredVolume), 'some material volume is measured');
    const texts = layoutMaterialTakeoff(rows, LABELS).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(texts.some((t) => /\d \*$/.test(t)), 'a figure carries the mark');
    assert.ok(texts.includes('MEASURED NOTE'));
    // The railings' open meshes are refused, and counted under the table.
    const unmeasured = rows.reduce((s, r) => s + (r.unmeasuredVolume ?? 0), 0);
    assert.ok(unmeasured > 0, 'the open railings are not measured');
    assert.ok(texts.includes(`UNMEASURED ${unmeasured}`));
  });

  it('counts measured figures per type in the quantities by type', () => {
    const data = typeQuantities(measured.types);
    const wallTotal = data.classTotals.find((c) => c.className === 'IfcWall')!.total;
    assert.equal(wallTotal.measuredVolume, 13);
    assert.equal(wallTotal.measuredArea, 13);
    const declaredWalls = typeQuantities(declared.types).classTotals.find((c) => c.className === 'IfcWall')!.total;
    assert.equal(declaredWalls.measuredVolume ?? 0, 0);
  });
});
