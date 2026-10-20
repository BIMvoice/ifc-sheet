/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CEILTAG measures a soffit in the frame the meshes are drawn in, so the floor it subtracts must be in
 * that frame too: the storey's placement-chain Z less the shift that frame applies, not its `Elevation`
 * attribute. The reflected-ceiling room is moved 250 m up in its site placement (as a georeferenced
 * export does) and meshed by the repo's engine; the soffit still reads +2.70 above Level 1.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import type { CoordinateInfo, MeshData } from '@ifc-lite/geometry';
import { ceilingTags } from './ceiling-tags';
import { levelFloorMeshY } from './ceiling-floor';
import { meshRcpFixture, rcpBounds, rcpFixtureText } from '@/test/rcp-fixture';

const SITE_Z = 250;
const STOREY = '3RCP000000000000000004';

/** The fixture with its site placed `SITE_Z` up; `elevation` is what the storey's Elevation attribute then says. */
function raised(elevation: number): string {
  const text = rcpFixtureText()
    .replace('#101=IFCCARTESIANPOINT((0.0000,0.0000,0.0000));', `#101=IFCCARTESIANPOINT((0.0000,0.0000,${SITE_Z.toFixed(4)}));`)
    .replace(/(#115=IFCBUILDINGSTOREY\([^;]*,)3\.0\);/, `$1${elevation.toFixed(1)});`);
  assert.ok(text.includes(`(0.0000,0.0000,${SITE_Z.toFixed(4)})`) && text.includes(`,${elevation.toFixed(1)});`), 'the fixture was edited');
  return text;
}

async function parse(text: string): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(text);
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}

/** The meshes in a render frame shifted down by `shiftY` (the viewer's origin shift), and that frame. */
function inFrame(meshes: MeshData[], shiftY: number): { meshes: MeshData[]; frame: CoordinateInfo } {
  const moved = meshes.map((m) => ({ ...m, positions: Float32Array.from(m.positions, (v, i) => (i % 3 === 1 ? v - shiftY : v)) }));
  const bounds = rcpBounds(moved);
  return { meshes: moved, frame: { originShift: { x: 0, y: shiftY, z: 0 }, originalBounds: bounds, shiftedBounds: bounds, hasLargeCoordinates: shiftY !== 0 } };
}

describe('the ceiling tag of a model placed 250 m up', () => {
  for (const { elevation, shiftY, label } of [
    { elevation: 3.0, shiftY: 0, label: 'Elevation relative to the site, frame not shifted' },
    { elevation: 3.0, shiftY: SITE_Z, label: 'Elevation relative to the site, frame shifted by the site height' },
    { elevation: SITE_Z + 3.0, shiftY: SITE_Z, label: 'Elevation absolute, frame shifted by the site height' },
    { elevation: SITE_Z + 3.0, shiftY: 0, label: 'Elevation absolute, frame not shifted' },
  ]) {
    it(`reads +2.70 above Level 1 (${label})`, async () => {
      const text = raised(elevation);
      const store = await parse(text);
      const { meshes: raw, ids } = meshRcpFixture(text);
      const { meshes, frame } = inFrame(raw, shiftY);
      const floor = levelFloorMeshY({ elevation, storeyGlobalIds: [STOREY] }, [store], frame);
      const tags = ceilingTags(meshes, floor, (id) => id === ids.ceiling);
      assert.equal(tags.length, 1);
      assert.equal(tags[0].text, '+2.70', `height ${tags[0].height}`);
    });
  }

  it('falls back to the Elevation attribute, in the same frame, for a level no loaded storey matches', () => {
    const frame = inFrame([], SITE_Z).frame;
    assert.equal(levelFloorMeshY({ elevation: SITE_Z + 3, storeyGlobalIds: ['not loaded'] }, [], frame), 3);
  });
});
