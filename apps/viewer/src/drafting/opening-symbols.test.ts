/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { parseDoorOperation, type DoorOperation } from '@bimvoice/ifcsheet';
import { doorSymbol, minAreaRect, openingSymbols } from './opening-symbols';

/** A box mesh (corners only), world = origin + positions. */
function box(ifcType: string, min: [number, number, number], max: [number, number, number], origin?: [number, number, number]): MeshData {
  const pts: number[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) pts.push(x, y, z);
  return { expressId: 7, ifcType, positions: new Float32Array(pts), origin } as unknown as MeshData;
}

describe('minAreaRect', () => {
  it('finds a rotated rectangle, width along the long side', () => {
    const a = Math.PI / 6;
    const u = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -u.y, y: u.x };
    const pts = [[-0.45, -0.1], [0.45, -0.1], [0.45, 0.1], [-0.45, 0.1]].map(([s, t]) => ({ x: 2 + u.x * s + n.x * t, y: 1 + u.y * s + n.y * t }));
    const r = minAreaRect(pts)!;
    assert.ok(Math.abs(r.width - 0.9) < 1e-9 && Math.abs(r.depth - 0.2) < 1e-9);
    assert.ok(Math.abs(r.c.x - 2) < 1e-9 && Math.abs(r.c.y - 1) < 1e-9);
    assert.ok(Math.abs(Math.abs(r.u.x * u.x + r.u.y * u.y) - 1) < 1e-9);
  });
});

describe('openingSymbols', () => {
  const plan = { axis: 'y' as const, position: 1.2, flipped: false };

  it('draws a door the cut passes through as a leaf open at 90° (a heavy rectangle) and a quarter arc, at the mesh origin', () => {
    const [door] = openingSymbols([box('IfcDoor', [-0.45, -1.05, -0.03], [0.45, 1.05, 0.03], [5, 1.05, 2])], plan);
    assert.equal(door.kind, 'door');
    const leaf = door.heavy?.[0];
    assert.ok(leaf && leaf.type === 'polyline' && leaf.closed && leaf.pts.length === 4);
    const len = Math.hypot(leaf.pts[1].x - leaf.pts[0].x, leaf.pts[1].y - leaf.pts[0].y);
    assert.ok(Math.abs(len - 0.9) < 1e-6, 'the leaf is as long as the opening is wide');
    const thick = Math.hypot(leaf.pts[3].x - leaf.pts[0].x, leaf.pts[3].y - leaf.pts[0].y);
    assert.ok(thick > 0.019 && thick < 0.051, 'and a few centimetres thick');
    const arc = door.shapes.find((s) => s.type === 'arc');
    assert.ok(arc && arc.type === 'arc');
    assert.ok(Math.abs(arc.r - 0.9) < 1e-6);
    let sweep = arc.end - arc.start;
    while (sweep <= 0) sweep += Math.PI * 2;
    assert.ok(Math.abs(sweep - Math.PI / 2) < 1e-6, 'a quarter turn');
    assert.ok(Math.abs(arc.c.x - 4.55) < 1e-6, 'hinged at a jamb');
  });

  it('flips the hinge jamb and the swing side', () => {
    const mesh = box('IfcDoor', [-0.45, -1.05, -0.03], [0.45, 1.05, 0.03], [5, 1.05, 2]);
    const arcOf = (flips: number) => openingSymbols([mesh], plan, () => flips)[0].shapes.find((s) => s.type === 'arc');
    const tipOf = (flips: number) => {
      const leaf = openingSymbols([mesh], plan, () => flips)[0].heavy?.[0];
      return leaf?.type === 'polyline' ? { type: 'line' as const, a: leaf.pts[0], b: leaf.pts[1] } : undefined;
    };
    const hand = arcOf(1);
    assert.ok(hand?.type === 'arc' && Math.abs(hand.c.x - 5.45) < 1e-6, 'hinged on the other jamb');
    const plain = tipOf(0), side = tipOf(2);
    assert.ok(plain?.type === 'line' && side?.type === 'line');
    assert.ok(Math.sign(plain.b.y - plain.a.y) === -Math.sign(side.b.y - side.a.y), 'opens to the other side');
  });

  it('draws a window as frame and glazing, and skips what the cut misses', () => {
    const symbols = openingSymbols([
      box('IfcWindow', [0, 0.9, 0], [1.2, 2.1, 0.2]),
      { ...box('IfcDoor', [0, 1.5, 0], [0.9, 3, 0.1]), expressId: 8 } as MeshData,
    ], plan);
    assert.deepEqual(symbols.map((s) => s.kind), ['window']);
    assert.equal(symbols[0].shapes.length, 3, 'frame and a double glazing line');
  });

  it('draws a wide door as a pair of leaves, one per jamb', () => {
    const [door] = openingSymbols([box('IfcDoor', [-0.8, -1.05, -0.03], [0.8, 1.05, 0.03], [5, 1.05, 2])], plan);
    assert.equal(door.heavy?.length, 2);
    const arcs = door.shapes.filter((s) => s.type === 'arc');
    assert.equal(arcs.length, 2);
    assert.ok(arcs.every((a) => a.type === 'arc' && Math.abs(a.r - 0.8) < 1e-6));
    assert.deepEqual(arcs.map((a) => (a.type === 'arc' ? Math.round(a.c.x * 100) / 100 : 0)).sort(), [4.2, 5.8]);
  });

  it('takes an element by its height over all its meshes: a door split across the cut is drawn', () => {
    const lower = box('IfcDoor', [-0.45, 0, -0.03], [0.45, 1, 0.03], [5, 0, 2]);
    const upper = box('IfcDoor', [-0.45, 1.4, -0.03], [0.45, 2.1, 0.03], [5, 0, 2]);
    const [door] = openingSymbols([lower, upper], plan);
    assert.equal(door?.kind, 'door', 'neither mesh alone spans the cut at 1.2, the element does');
    assert.equal(door.heavy?.length, 1);
  });

  it('reads no more than the heights of a door on another storey (#154)', () => {
    // Every read of a position that is not a height (x or z) counts: projecting the mesh needs them, its height range does not.
    let planReads = 0;
    const upstairs = box('IfcDoor', [-0.45, 4, -0.03], [0.45, 6, 0.03], [9, 0, 2]);
    const raw = upstairs.positions as Float32Array;
    const counted = new Proxy(raw, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key) && Number(key) % 3 !== 1) planReads++;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const here = box('IfcDoor', [-0.45, -1.05, -0.03], [0.45, 1.05, 0.03], [5, 1.05, 2]);
    const symbols = openingSymbols([{ ...upstairs, expressId: 9, positions: counted } as unknown as MeshData, here], plan);
    assert.deepEqual(symbols.map((s) => s.id), [7], 'only the door the cut passes through');
    assert.equal(planReads, 0, 'the door upstairs is not projected onto the plan');
  });
});

/** #486: the swing follows the door's stated operation, read against its placement (IFC4.3 IfcDoorTypeOperationEnum: LEFT = hinges on local -X seen along +Y, the leaf opens to +Y). */
describe('openingSymbols with a stated operation', () => {
  const plan = { axis: 'y' as const, position: 1.2, flipped: false };
  const left: DoorOperation = { motion: 'swing', hinge: 'left', towards: null, leaves: 1, doubleActing: false };
  const right: DoorOperation = { ...left, hinge: 'right' };
  /** Row-major localToWorld (renderer frame): IFC local X = column 0, IFC local Y = minus column 2. `mx`: X mirrored; `my`: Y mirrored. */
  const placed = (mx = false, my = false): MeshData => ({
    ...box('IfcDoor', [-0.45, -1.05, -0.03], [0.45, 1.05, 0.03], [5, 1.05, 2]),
    localToWorld: [mx ? -1 : 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, my ? -1 : 1, 0, 0, 0, 0, 1],
  } as unknown as MeshData);
  const read = (mesh: MeshData, op: DoorOperation | null, flips = 0) => {
    const [door] = openingSymbols([mesh], plan, () => flips, () => null, () => op);
    const arc = door.shapes.find((x) => x.type === 'arc');
    const leaf = door.heavy?.[0];
    if (arc?.type !== 'arc' || leaf?.type !== 'polyline') throw new Error('no door symbol');
    return { hingeX: arc.c.x, tipY: leaf.pts[1].y - leaf.pts[0].y };
  };

  it('hinges LEFT on the placement\'s -X jamb and RIGHT on its +X jamb', () => {
    assert.ok(Math.abs(read(placed(), left).hingeX - 4.55) < 1e-6);
    assert.ok(Math.abs(read(placed(), right).hingeX - 5.45) < 1e-6);
  });

  it('swings to the placement\'s +Y, whichever hand the door has', () => {
    // IFC +Y is renderer -Z: the drawing's -y here.
    assert.ok(read(placed(), left).tipY < 0 && read(placed(), right).tipY < 0);
    assert.ok(read(placed(false, true), left).tipY > 0, 'a placement with Y reversed swings the other way');
  });

  it('mirrors the hand with a mirrored placement (negative determinant)', () => {
    assert.ok(Math.abs(read(placed(true), left).hingeX - 5.45) < 1e-6);
    assert.ok(Math.abs(read(placed(true), right).hingeX - 4.55) < 1e-6);
  });

  it('lets a manual flip toggle the stated hand, and draws as before when the model states none', () => {
    assert.ok(Math.abs(read(placed(), left, 1).hingeX - 5.45) < 1e-6);
    assert.ok(Math.abs(read(placed(), null).hingeX - 4.55) < 1e-6);
  });

  it('draws the pair a DOUBLE_DOOR states even in a narrow opening', () => {
    const [door] = openingSymbols([placed()], plan, () => 0, () => null, () => ({ motion: 'swing', hinge: null, towards: null, leaves: 2, doubleActing: false }));
    assert.equal(door.heavy?.length, 2);
  });

  // Review of #505: DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_* drew both leaves to one side. IFC4.3: "one panel swings in one direction and the
  // other panel swings in the opposite direction". The hand names the leaf that opens to +Y.
  it('swings the two leaves of DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_* to opposite sides, the named one to the placement\'s +Y', () => {
    const leaves = (value: string) => {
      const [door] = openingSymbols([placed()], plan, () => 0, () => null, () => parseDoorOperation(value));
      return (door.heavy ?? []).map((leaf) => {
        if (leaf.type !== 'polyline') throw new Error('no leaf');
        return { hingeX: leaf.pts[0].x, tipY: leaf.pts[1].y - leaf.pts[0].y };
      }).sort((a, b) => a.hingeX - b.hingeX);
    };
    // IFC +Y is the drawing's -y here; the placement's -X jamb is at x = 4.55.
    const oppositeLeft = leaves('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT');
    assert.equal(oppositeLeft.length, 2);
    assert.ok(oppositeLeft[0].tipY < 0 && oppositeLeft[1].tipY > 0, 'LEFT: the left leaf opens to +Y, the right one to -Y');
    const oppositeRight = leaves('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_RIGHT');
    assert.ok(oppositeRight[0].tipY > 0 && oppositeRight[1].tipY < 0, 'RIGHT: the right leaf opens to +Y, the left one to -Y');
    const same = leaves('DOUBLE_DOOR_SINGLE_SWING');
    assert.ok(same.every((leaf) => leaf.tipY < 0), 'DOUBLE_DOOR_SINGLE_SWING still swings both leaves one way');
  });
});

// Review of #522: the overhead bar stayed on the +n face whatever the leaf-side flip, while a sliding leaf moved with it.
describe('doorSymbol for an overhead door', () => {
  const rect = { c: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: 0.9, depth: 0.2 };
  const overhead: DoorOperation = { motion: 'overhead', hinge: null, towards: null, leaves: 1, doubleActing: false };
  const barYs = (flips: number) => doorSymbol(rect, flips, overhead).heavy.flatMap((s) => (s.type === 'polyline' ? s.pts.map((p) => p.y) : []));

  it('puts the bar on the face the leaf-side flip names: flips 0 and 2 on opposite sides', () => {
    assert.ok(barYs(0).every((y) => y >= 0.1 - 1e-9), 'flips 0: on the +n face');
    assert.ok(barYs(2).every((y) => y <= -0.1 + 1e-9), 'flips 2: on the -n face');
  });
});


/** #486: a sliding, folding or revolving door keeps its own symbol when its placement's X does not run along the opening (only the hand is then unknown). */
describe('openingSymbols with a stated operation on a placement turned across the opening', () => {
  const plan = { axis: 'y' as const, position: 1.2, flipped: false };
  // Local X along world z, across the 0.9 m wide opening that runs along world x.
  const across = {
    ...box('IfcDoor', [-0.45, -1.05, -0.03], [0.45, 1.05, 0.03], [5, 1.05, 2]),
    localToWorld: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1],
  } as unknown as MeshData;
  const symbol = (op: DoorOperation) => openingSymbols([across], plan, () => 0, () => null, () => op)[0];

  it('draws a revolving door as the circle and cross, not a swing arc', () => {
    const door = symbol({ motion: 'revolving', hinge: null, towards: null, leaves: 1, doubleActing: false });
    assert.ok(door.shapes.some((s) => s.type === 'circle'));
    assert.ok(!door.shapes.some((s) => s.type === 'arc'));
  });

  it('draws a sliding door as a bar with an arrow, not a swing arc', () => {
    const door = symbol({ motion: 'sliding', hinge: null, towards: 'left', leaves: 1, doubleActing: false });
    assert.ok(!door.shapes.some((s) => s.type === 'arc'));
  });

  // Review of #522: a lifting or rolling-up door (LIFTING_*, ROLLINGUP) drew as a default swing with a 90 degree arc.
  it('draws an overhead (lifting, rolling-up) door as a bar and a dashed panel line, with no swing arc', () => {
    for (const leaves of [1, 2] as const) {
      const door = symbol({ motion: 'overhead', hinge: null, towards: null, leaves, doubleActing: false });
      const all = [...door.shapes, ...(door.heavy ?? []), ...(door.dashed ?? [])];
      assert.ok(!all.some((s) => s.type === 'arc'), 'no swing arc');
      assert.equal(door.heavy?.length, leaves, 'one bar per leaf');
      assert.equal(door.dashed?.length, 1);
    }
  });

  it('still leaves a swinging door as it was drawn', () => {
    const door = symbol({ motion: 'swing', hinge: 'left', towards: null, leaves: 1, doubleActing: false });
    assert.ok(door.shapes.some((s) => s.type === 'arc'));
  });
});
