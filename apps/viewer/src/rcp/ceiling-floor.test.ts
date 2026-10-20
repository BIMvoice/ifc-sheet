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
import { ceilingPlanTags, levelFloorMeshY } from './ceiling-floor';
import { ensureRcpWasm, meshRcpFixture, rcpBounds, rcpFixtureText } from '@/test/rcp-fixture';

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
    it(`reads +2.70 above Level 1 (${label})`, async (t) => {
      if (!ensureRcpWasm(t)) return;
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

/**
 * Three storeys of the reflected-ceiling room: Level 0 at 0 m and Level 2 at 6 m are added to the fixture's
 * Level 1 at 3 m, each with its own copy of the L-shaped ceiling 2.70 m above its floor (soffits at 2.70,
 * 5.70 and 8.70 m). Built in memory from the committed fixture.
 */
function threeStoreys(): string {
  const storey = (n: number, z: number, gid: string) => [
    `#${n}=IFCCARTESIANPOINT((0.0000,0.0000,${z.toFixed(4)}));`,
    `#${n + 1}=IFCAXIS2PLACEMENT3D(#${n},$,$);`,
    `#${n + 2}=IFCLOCALPLACEMENT(#103,#${n + 1});`,
    `#${n + 3}=IFCBUILDINGSTOREY('${gid}',$,'Level ${z / 3}',$,$,#${n + 2},$,$,.ELEMENT.,${z.toFixed(1)});`,
    `#${n + 4}=IFCPRODUCTDEFINITIONSHAPE($,$,(#191));`,
    `#${n + 5}=IFCCOVERING('${gid.slice(0, -1)}C',$,'Ceiling of level ${z / 3}',$,$,#${n + 2},#${n + 4},$,.CEILING.);`,
    `#${n + 6}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${gid.slice(0, -1)}R',$,$,$,(#${n + 5}),#${n + 3});`,
  ];
  const added = [...storey(300, 0, '3RCP00000000000000L000'), ...storey(310, 6, '3RCP00000000000000L200'), "#320=IFCRELAGGREGATES('3RCP00000000000000L900',$,$,$,#111,(#303,#313));"];
  const text = rcpFixtureText().replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${added.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`);
  assert.ok(text.includes('#320=IFCRELAGGREGATES'), 'the fixture was extended');
  return text;
}

describe('the ceiling tags of one storey of a three-storey model', () => {
  const LEVELS = [
    { name: 'Level 0', elevation: 0, storeyGlobalIds: ['3RCP00000000000000L000'] },
    { name: 'Level 1', elevation: 3, storeyGlobalIds: [STOREY] },
    { name: 'Level 2', elevation: 6, storeyGlobalIds: ['3RCP00000000000000L200'] },
  ];

  it('tags only the ceiling between its cut and the next level, never another storey\'s', async (t) => {
    if (!ensureRcpWasm(t)) return;
    const text = threeStoreys();
    const store = await parse(text);
    const { meshes, ids } = meshRcpFixture(text);
    assert.equal(ids.ceilings.length, 3, 'three ceilings');
    const isCeiling = (id: number) => ids.ceilings.includes(id);
    const soffits: number[] = [];
    for (const [i, level] of LEVELS.entries()) {
      const tags = ceilingPlanTags(meshes, { level, cutHeight: 1.2 }, LEVELS, [store], undefined, isCeiling);
      assert.deepEqual(tags.map((tag) => tag.text), ['+2.70'], `${level.name}: one tag, its own ceiling (got ${tags.map((tag) => tag.text).join(', ')})`);
      soffits.push(tags[0].renderId);
      assert.equal(new Set(soffits).size, i + 1, `${level.name} tags a ceiling no other level tagged`);
    }
    // Every ceiling is there, so the filter is what leaves the others out.
    assert.equal(ceilingTags(meshes, 3, isCeiling).length, 3);
  });

  it('leaves out a ceiling below the cut, and one at or above the next level', () => {
    const slab = (expressId: number, y: number) => ({ expressId, ifcType: 'IfcCovering', positions: new Float32Array([0, y, 0, 1, y, 0, 0, y, 1]), indices: new Uint32Array([0, 1, 2]) });
    const levels = [{ elevation: 0, storeyGlobalIds: [] }, { elevation: 3, storeyGlobalIds: [] }];
    const tags = ceilingPlanTags([slab(1, 1.0), slab(2, 2.7), slab(3, 3.0), slab(4, 5.7)], { level: levels[0], cutHeight: 1.2 }, levels, [], undefined, () => true);
    assert.deepEqual(tags.map((tag) => tag.renderId), [2]);
    const top = ceilingPlanTags([slab(4, 5.7), slab(5, 30)], { level: levels[1], cutHeight: 1.2 }, levels, [], undefined, () => true);
    assert.deepEqual(top.map((tag) => tag.renderId), [4, 5], 'the top level has no level above to stop at');
  });
});
