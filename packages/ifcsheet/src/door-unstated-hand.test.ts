/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #679: a door that states no operation (IfcDoor and IfcDoorType OperationType unset or NOTDEFINED) is drawn the way Bonsai and IfcOpenShell
 * make its body: hinged at the placement's local x = 0, the leaf and the arc to local +Y (`UNSTATED_DOOR_OPERATION`). Stated invariant: that
 * holds for every turn of the placement, where the footprint's own axes (what the default used to follow) say nothing about the placement.
 * The second block runs a small IFC file (`__fixtures__/door-unstated-hand.ifc`) through the whole headless path.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openingSymbols } from './opening-symbols.js';
import { planOpeningSymbols } from './plan-openings.js';
import { resolveViewGraphics } from './view-templates.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1, flipped: false };

/**
 * A 0.9 m by 0.1 m door footprint of an IFC placement at (tx, ty) turned `deg` about Z: local x 0..0.9, local y 0..0.1, built in the
 * renderer frame (x = IFC X, y = IFC Z, z = minus IFC Y) with the row-major `localToWorld` the engine reads (IFC local X is its column 0, local Y minus its column 2).
 */
function door(deg: number, tx: number, ty: number): MeshData {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  const positions: number[] = [];
  for (const lx of [0, 0.9]) for (const ly of [0, 0.1]) for (const h of [0, 2]) positions.push(tx + c * lx - s * ly, h, -(ty + s * lx + c * ly));
  const localToWorld = [c, 0, s, tx, 0, 1, 0, 0, -s, 0, c, -ty, 0, 0, 0, 1];
  return { expressId: 2, ifcType: 'IfcDoor', positions: new Float32Array(positions), indices: new Uint32Array(0), normals: new Float32Array(0), color: [1, 1, 1, 1], localToWorld } as unknown as MeshData;
}

describe('a door that states no operation hinges on its placement\'s local -X and opens to its +Y (#679, stated invariant)', () => {
  for (const deg of [0, 90, 180, 270, 37]) {
    it(`for a placement turned ${deg} degrees`, () => {
      const tx = 3, ty = 5, a = (deg * Math.PI) / 180;
      const [symbol] = openingSymbols([door(deg, tx, ty)], plane);
      const leaf = symbol.heavy![0];
      if (leaf.type !== 'polyline') throw new Error('no leaf');
      // Drawing y is minus IFC Y: back to IFC, then onto the placement's axes.
      const toIfc = (p: { x: number; y: number }) => ({ x: p.x - tx, y: -p.y - ty });
      const local = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(a) + p.y * Math.sin(a), y: -p.x * Math.sin(a) + p.y * Math.cos(a) });
      const hinge = local(toIfc(leaf.pts[0])), tip = local(toIfc(leaf.pts[1]));
      expect(hinge.x, 'the hinge at local x = 0').toBeLessThan(0.05);
      expect(tip.y - hinge.y, 'the leaf opens to local +Y').toBeGreaterThan(0.8);
      expect(Math.abs(tip.x - hinge.x), 'and stands square to the opening').toBeLessThan(0.15);
    });
  }
});

const FIXTURE = fileURLToPath(new URL('./__fixtures__/door-unstated-hand.ifc', import.meta.url));

/** Each door of the fixture: [name, IFC X and Y of the hinge, IFC direction the leaf opens in]; the hinge is the placement origin, the leaf opens along the placement's local +Y. */
const DOORS: [string, [number, number], [number, number]][] = [
  ['A', [1, 1], [0, 1]],
  ['B', [5, 1], [-1, 0]],
  ['C', [1, 5], [0, -1]],
  ['D', [5, 5], [0, 1]],
];

describe('doors of an IFC file with no OperationType swing as IfcOpenShell makes them (#679)', () => {
  it('hinges at local x = 0 and opens to local +Y for each turn, and the same as a door that states SINGLE_SWING_LEFT', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model)!;
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
    const found = new Map<string, { hinge: { x: number; y: number }; open: { x: number; y: number } }>();
    for (const v of plans) {
      for (const s of planOpeningSymbols(model.buildingMeshes, drawings.get(v.id)!.config.plane, { live: { dataStore: model.dataStore, view: null }, project }, resolveViewGraphics(v, set.document.viewTemplates), v.level)) {
        const leaf = s.heavy?.find((x) => x.type === 'polyline');
        const name = model.dataStore.entities?.getName?.(s.id);
        if (leaf?.type !== 'polyline' || !name) continue;
        const [h, t] = leaf.pts;
        found.set(name, { hinge: { x: h.x, y: -h.y }, open: { x: t.x - h.x, y: -(t.y - h.y) } });
      }
    }
    for (const [name, hinge, open] of DOORS) {
      const d = found.get(name);
      expect(d, `${name} is on a plan`).toBeDefined();
      expect(Math.hypot(d!.hinge.x - hinge[0], d!.hinge.y - hinge[1]), `${name} hinge (within one frame depth of the origin, the other jamb is 0.9 m away)`).toBeLessThan(0.15);
      expect(d!.open.x * open[0] + d!.open.y * open[1], `${name} opens to its placement's +Y`).toBeGreaterThan(0.8);
    }
  }, 200_000);
});
