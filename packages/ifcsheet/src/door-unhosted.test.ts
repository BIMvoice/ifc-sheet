/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door the model hosts in no wall (no IfcRelFillsElement to an opening that voids a wall) was drawn on its frame's footprint: the
 * hinge on the frame's edge, off the jamb and off the wall face, and the swing as wide as the frame. Measured across the models of
 * `tests/models` (the plan audit in the pull request that added this test): 1,073 of 4,122 doors on a plan have no host opening, and of
 * the 761 whose wall gap could be measured, 51 sat within 20 mm of it. Such a door is now fitted to the walls it stands in, found by
 * their geometry (`opening-in-wall.ts`, `wallsAround`), as a hosted door is fitted to its host.
 *
 * `__fixtures__/door-unhosted.ifc`: a 0.1 m wall split at two 0.9 m gaps (x 2 to 2.9, and x 5 to 5.9 whose far jamb is a 0.1 m by
 * 0.1 m stub), a wall at right angles 0.2 m past the first gap, and a door in each gap stating SINGLE_SWING_LEFT, placed at its left
 * jamb with local +Y to +y, its frame 0.925 m wide and 0.12 m deep.
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

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-unhosted.ifc', import.meta.url));

describe('a door the model hosts in no wall is drawn in the gap of the walls it stands in', () => {
  for (const [name, jamb, far] of [['Door', 2, 'the cross wall\'s far end'], ['Door B', 5, 'the stub\'s']] as const) {
    it(`${name}: hinges on the wall face at the x = ${jamb} jamb and swings as wide as the gap, not the frame`, async () => {
      const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
      const set = generateDefaultSet(model)!;
      const plans = set.document.views.filter((v) => v.kind === 'plan');
      const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
      const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
      const doors = plans.flatMap((v) => planOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(v, set.document.viewTemplates), v.level))
        .filter((s) => s.kind === 'door' && model.dataStore.entities?.getName?.(s.id) === name);
      expect(doors).toHaveLength(1);
      const [door] = doors;
      expect(openingHostsOf(model.dataStore).has(door.id), 'the fixture hosts the door in no wall').toBe(false);
      const leaf = door.heavy?.find((s) => s.type === 'polyline');
      const arc = door.shapes.find((s) => s.type === 'arc');
      if (leaf?.type !== 'polyline' || arc?.type !== 'arc') throw new Error('the door has no leaf or no swing');
      // Drawing y is minus IFC Y.
      const [hinge, tip] = leaf.pts.map((p) => ({ x: p.x, y: -p.y }));
      expect(hinge.x, `the hinge at the x = ${jamb} jamb (SINGLE_SWING_LEFT: local -X), not the frame's edge 12.5 mm out`).toBeCloseTo(jamb, 3);
      expect(hinge.y, `the hinge on the wall's y = 0.1 face, not the frame's at 0.11 nor ${far}`).toBeCloseTo(0.1, 3);
      expect(tip.y - hinge.y, 'the leaf opens to local +Y, as wide as the gap').toBeCloseTo(0.9, 3);
      expect(arc.r, 'the swing as wide as the gap (0.9 m), not the frame (0.925 m)').toBeCloseTo(0.9, 3);
    });
  }
});
