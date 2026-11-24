/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831 (point 7): a door whose frame stands proud of its wall's faces by more than a few centimetres (a casing, an architrave, a
 * wrap-around frame) was drawn on its frame's footprint instead of in its opening: the hinge off the wall face by the casing's depth and
 * the swing as wide as the frame, not the void. Measured across the models of `tests/models`: every door of a small house (39 symbols,
 * Umfassungszarge 85 mm proud), 107 of an office model (85 mm), 22 of a Revit model (casings, 55 mm), most of a school (60 mm). The door
 * is in its wall when the wall's band holds the door's middle line, whatever its frame does outside the faces; and its jambs are the
 * wall's vertices the plan's cut passes through, not those of a narrower void higher up (`opening-in-wall.ts`).
 *
 * `__fixtures__/door-proud-frame.ifc`: a 0.125 m wall with two 0.9 m voids, from x 2 to 2.9 and from x 4 to 4.9 (a narrower void above
 * the second, 2.3 m to 2.6 m up), each filled by a door stating SINGLE_SWING_LEFT, placed at its left jamb with local +Y to +y, whose
 * casings stand 85 mm proud of the y = 0 face and 25 mm of the y = 0.125 face, 70 mm past each jamb.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { planOpeningSymbols } from './plan-openings.js';
import { resolveViewGraphics } from './view-templates.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-proud-frame.ifc', import.meta.url));

describe('a door whose frame stands proud of its wall is drawn in its opening (#831)', () => {
  for (const [name, jamb] of [['Door', 2], ['Door B', 4]] as const) {
    it(`${name}: hinges on the wall face at the jamb the model states and swings as wide as the void`, async () => {
      const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
      const set = generateDefaultSet(model)!;
      const plans = set.document.views.filter((v) => v.kind === 'plan');
      const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
      const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
      const doors = plans.flatMap((v) => planOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(v, set.document.viewTemplates), v.level))
        .filter((s) => s.kind === 'door' && model.dataStore.entities?.getName?.(s.id) === name);
      expect(doors).toHaveLength(1);
      const [door] = doors;
      const leaf = door.heavy?.find((s) => s.type === 'polyline');
      const arc = door.shapes.find((s) => s.type === 'arc');
      if (leaf?.type !== 'polyline' || arc?.type !== 'arc') throw new Error('the door has no leaf or no swing');
      // Drawing y is minus IFC Y.
      const [hinge, tip] = leaf.pts.map((p) => ({ x: p.x, y: -p.y }));
      expect(hinge.x, `the hinge at the x = ${jamb} jamb (SINGLE_SWING_LEFT: local -X), not the casing's edge`).toBeCloseTo(jamb, 2);
      expect(hinge.y, 'the hinge on the wall\'s y = 0.125 face, not the casing\'s at 0.15').toBeCloseTo(0.125, 2);
      expect(tip.y - hinge.y, 'the leaf opens to local +Y, as wide as the void').toBeCloseTo(0.9, 2);
      expect(arc.r, 'the swing as wide as the void, not the frame (1.04 m) or the void above').toBeCloseTo(0.9, 2);
    });
  }
});
