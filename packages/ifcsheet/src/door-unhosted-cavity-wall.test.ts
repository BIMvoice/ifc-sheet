/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door the model hosts in no wall is fitted to the walls it stands in, found by geometry (#886). When that wall is built as two leaves
 * with a cavity between them, the door stands in one leaf, and its hinge goes on that leaf's face. Before, every mesh of the wall was
 * read as one band and the hinge was drawn on the far leaf's face: measured in a large Dutch housing model (`tests/models`, the plan
 * audit of #886), a door in a 205 mm partition of two 100 mm leaves 5 mm apart had its hinge 105 mm off the face of its leaf (#831).
 *
 * `__fixtures__/door-unhosted-cavity-wall.ifc`: one IfcWall of two 0.1 m leaves (y 0 to 0.1 and y 0.105 to 0.205), each split at a
 * 0.98 m gap from x 2 to 2.98, and a door in leaf A stating SINGLE_SWING_LEFT, placed at its left jamb with local +Y to +y, its frame
 * 1.005 m wide and 0.1 m deep. No IfcOpeningElement, no IfcRelFillsElement.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openingHostsOf } from './opening-hosts.js';
import { planOpeningSymbols } from './plan-openings.js';
import { resolveViewGraphics } from './view-templates.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-unhosted-cavity-wall.ifc', import.meta.url));

describe('a door hosted in no wall, in one leaf of a cavity wall (#831)', () => {
  it('hinges on the face of the leaf it stands in, not on the far leaf\'s face', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model)!;
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    const doors = plans.flatMap((v) => planOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(v, set.document.viewTemplates), v.level))
      .filter((s) => s.kind === 'door');
    expect(doors).toHaveLength(1);
    const [door] = doors;
    expect(openingHostsOf(model.dataStore).has(door.id), 'the fixture hosts the door in no wall').toBe(false);
    const leaf = door.heavy?.find((s) => s.type === 'polyline');
    const arc = door.shapes.find((s) => s.type === 'arc');
    if (leaf?.type !== 'polyline' || arc?.type !== 'arc') throw new Error('the door has no leaf or no swing');
    // Drawing y is minus IFC Y.
    const [hinge, tip] = leaf.pts.map((p) => ({ x: p.x, y: -p.y }));
    expect(hinge.x, 'the hinge at the x = 2 jamb (SINGLE_SWING_LEFT: local -X)').toBeCloseTo(2, 3);
    expect(hinge.y, 'the hinge on leaf A\'s y = 0.1 face, not on leaf B\'s at 0.205').toBeCloseTo(0.1, 3);
    expect(tip.y - hinge.y, 'the leaf opens to local +Y, as wide as the gap').toBeCloseTo(0.98, 3);
    expect(arc.r, 'the swing as wide as the gap (0.98 m), not the frame (1.005 m)').toBeCloseTo(0.98, 3);
  });
});
