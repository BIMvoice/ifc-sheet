/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door the model hosts in no wall is fitted to the walls it stands in, found by their geometry (#886, `opening-in-wall.ts`,
 * `wallsAround`). In a large Dutch housing model one jamb of most such doors is a thin IfcWall piece that closes the wall's end: 0.1 m
 * long (the wall's thickness) and 20 to 30 mm along the wall. Being more than twice as long as it is wide, it was read as a wall running
 * across the door and left out, so only one jamb was found and the door was drawn on its frame: 25 mm wider than the gap, the hinge
 * 12.5 mm off the jamb (195 doors in that model, measured in the pull request that added this test).
 *
 * `__fixtures__/door-jamb-piece.ifc`: a 0.1 m wall with two 0.975 m gaps. Door's jambs are Wall A's end (x 2) and a 0.03 m piece
 * (x 2.975); Door B's are a 0.03 m piece (x 6) and a 0.095 m stub (x 6.975). Frames are 1.0 m wide and 0.12 m deep, both doors
 * SINGLE_SWING_LEFT, placed at their left jamb with local +Y to +y.
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

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-jamb-piece.ifc', import.meta.url));

describe('a door whose jamb is a thin wall piece across the wall is drawn in the gap, not on its frame (#886 follow-up)', () => {
  for (const [name, jamb, jambs] of [['Door', 2, 'Wall A\'s end and Piece 1'], ['Door B', 6, 'Piece 2 and the stub']] as const) {
    it(`${name}: hinges at the x = ${jamb} jamb and is as wide as the gap between ${jambs}`, async () => {
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
      expect(hinge.x, `the hinge at the x = ${jamb} jamb, not the frame's edge 12.5 mm out`).toBeCloseTo(jamb, 3);
      expect(hinge.y, 'the hinge on the wall\'s y = 0.1 face').toBeCloseTo(0.1, 3);
      expect(tip.y - hinge.y, 'the leaf as wide as the gap (0.975 m), not the frame (1.0 m)').toBeCloseTo(0.975, 3);
      expect(arc.r, 'the swing as wide as the gap').toBeCloseTo(0.975, 3);
    });
  }
});
