/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * bloc-p4's two IfcStair on the ground floor are entrance steps outside the facade (z 0.76 to 1.36 m, the walls end at
 * 0.03 m). The lengthwise section of the starting set was cut through them: Section B-B stood outside every wall and
 * drew eight balcony slabs, their railings and a step, and no building. Every section the set proposes cuts the
 * building's walls.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import type { SectionProjectView } from './document.js';
import { openModel } from './model.js';
import { storeyFloorsOf } from './plan-projection.js';
import { proposeSections, type ProposalInput } from './section-proposals.js';
import { generateViewDrawings } from './view-drawings.js';

const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const skip = !existsSync(BLOC) || !existsSync(WASM);

describe.skipIf(skip)('the starting set\'s sections on bloc-p4', () => {
  it('each cut the building\'s walls, none only the balconies outside the facade', async () => {
    const model = await openModel(new Uint8Array(readFileSync(BLOC)));
    const set = generateDefaultSet(model, { now: 0 });
    const sections = (set?.document.views ?? []).filter((v): v is SectionProjectView => v.kind === 'section');
    expect(sections.map((s) => s.name)).toEqual(['Section A-A', 'Section B-B']);
    if (!set || !model.extent) throw new Error('bloc-p4 gave no set');
    const drawings = await generateViewDrawings(sections, model.buildingMeshes, set.levels, model.extent, (_v, e) => { throw e; }, () => {}, storeyFloorsOf(model.buildingMeshes, model.dataStore.spatialHierarchy));
    for (const section of sections) {
      const walls = new Set((drawings.get(section.id)?.cutPolygons ?? []).filter((p) => p.ifcType === 'IfcWall').map((p) => p.entityId));
      expect({ section: section.name, through: section.through, wallsCut: walls.size >= 10 }).toEqual({ section: section.name, through: section.through, wallsCut: true });
    }
  }, 120_000);
});

describe('a stair outside the walls', () => {
  // bloc-p4's shape in small: a block 20 x 12 m behind its walls, entrance steps 1 m in front of the facade, no rooms.
  const input: ProposalInput = {
    building: { min: { x: 0, z: 0 }, max: { x: 20, z: 14 } },
    rooms: [],
    stairs: [{ min: { x: 9, z: 12.8 }, max: { x: 11, z: 13.4 } }],
    walls: [{ min: { x: 0, z: 11.8 }, max: { x: 20, z: 12 } }, { min: { x: 0, z: 0 }, max: { x: 20, z: 0.2 } }, { min: { x: 0, z: 0 }, max: { x: 0.2, z: 12 } }, { min: { x: 19.8, z: 0 }, max: { x: 20, z: 12 } }],
  };

  it('gets no cut along the facade through it: the lengthwise cut goes through the middle of the walls', () => {
    const lengthwise = proposeSections(input).filter((p) => p.key.startsWith('long-'));
    expect(lengthwise.map((p) => ({ label: p.label, z: p.a.z }))).toEqual([{ label: 'Through the middle, lengthwise', z: 6 }]);
  });

  it('still gets the cut across the building through it', () => {
    expect(proposeSections(input)[0]).toMatchObject({ label: 'Through the stair', a: { x: 10 } });
  });
});
