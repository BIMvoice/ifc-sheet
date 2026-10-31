/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What DIMALL prints against what the model says (#632). A chain's spans add up to its overall by construction, so a sum
 * proves nothing: each figure here is compared with a value read off the list of walls and openings the plan was cut
 * from (`model-fixture.ts`). A figure that cannot be trusted must be left out and counted, never printed approximately.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pt } from '@/drafting/types';
import { joinLayers, wallGaps } from './layers';
import { boxOf, mainDirection, ringOnAxes } from './outline';
import { lShape, part, rect } from './fixture';
import { kindOfClass, planParts } from './parts';
import { planDimensions } from './plan';
import { rectangle, surveyParts, trueWidths, type SurveyWall } from './model-fixture';
import type { DimensionPlan, PlannedString } from './types';

const SETTINGS = { paperUnit: 0.1, textHeight: 0.25 };
const MM = 0.001;
const plan = (walls: readonly SurveyWall[]) => planDimensions(surveyParts(walls), SETTINGS);
const spans = (s: PlannedString) => s.points.slice(1).map((b, i) => Math.hypot(b.x - s.points[i].x, b.y - s.points[i].y));
const overalls = (p: DimensionPlan) => p.strings.filter((s) => s.kind === 'overall').map((s) => spans(s)[0]).sort((a, b) => a - b);
const close = (got: readonly number[], want: readonly number[], what: string) => {
  assert.equal(got.length, want.length, `${what}: ${got.join()} against ${want.join()}`);
  got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) <= MM, `${what}: ${got.join()} against ${want.join()}`));
};

/** Every span that says it measures an opening, against that opening's width in the list; the number of them. */
function openingsMatch(p: DimensionPlan, walls: readonly SurveyWall[]): number {
  const widths = trueWidths(walls);
  let seen = 0;
  for (const s of p.strings) {
    spans(s).forEach((len, k) => {
      const id = s.measures[k];
      if (id === null) return;
      seen++;
      assert.ok(Math.abs(len - (widths.get(id) as number)) <= MM, `opening ${id} prints ${len}, the model has ${widths.get(id)}`);
    });
  }
  return seen;
}

/** Turn the whole list about the origin. */
const turnedBy = (walls: readonly SurveyWall[], deg: number): SurveyWall[] => walls.map((w) => {
  const r = (deg * Math.PI) / 180;
  return { ...w, degrees: w.degrees + deg, start: { x: w.start.x * Math.cos(r) - w.start.y * Math.sin(r), y: w.start.x * Math.sin(r) + w.start.y * Math.cos(r) } };
});

const door = (id: number, at: number, width: number, stops: readonly [number, number] = [0, 0]) => ({ id, kind: 'door' as const, at, width, stops });
const window_ = (id: number, at: number, width: number) => ({ id, kind: 'window' as const, at, width });

describe('DIMALL prints what the model has', () => {
  it('reads the overall through a mitred corner, also where the walls differ in thickness', () => {
    const walls: SurveyWall[] = [
      { id: 1, start: { x: 0, y: 0 }, degrees: 0, length: 9, thickness: 0.3, mitre: [0.3, 0.24], openings: [window_(11, 3, 2)] },
      { id: 2, start: { x: 9, y: 0 }, degrees: 90, length: 7, thickness: 0.24, mitre: [0.3, 0.3], openings: [window_(12, 2.5, 1.5)] },
      { id: 3, start: { x: 9, y: 7 }, degrees: 180, length: 9, thickness: 0.3, mitre: [0.24, 0.3] },
      { id: 4, start: { x: 0, y: 7 }, degrees: 270, length: 7, thickness: 0.3, mitre: [0.3, 0.3] },
    ];
    const p = plan(walls);
    close(overalls(p), [7, 9], 'the overall of the two sides that have something on them');
    assert.equal(openingsMatch(p, walls), 2);
    assert.equal(p.droppedStrings, 0);
  });

  it('measures a door along its wall on a building turned by 6 degrees, stops and all', () => {
    const walls = turnedBy(rectangle(10, 6, 0.3, [door(11, 2, 1.06, [0.04, 0.04]), door(12, 6, 1.06, [0.08, 0.02])], [window_(13, 1, 1.5)]), 6);
    const p = plan(walls);
    assert.ok(Math.abs((p.angle * 180) / Math.PI - 6) < 0.01, `the plan's frame is the walls': ${(p.angle * 180) / Math.PI}`);
    assert.equal(openingsMatch(p, walls), 3);
    close(overalls(p), [6, 10], 'the overall along the turned walls');
  });

  it('keeps a door to its gap when its frame reaches past the jambs, or falls short of them', () => {
    const walls = rectangle(8, 6, 0.3, [door(11, 1.5, 0.9, [0.03, 0.05]), door(12, 4, 0.9, [-0.02, -0.02])]);
    assert.equal(openingsMatch(plan(walls), walls), 2);
  });

  it('does not take a cross wall that grazes the door for its jamb', () => {
    const walls = rectangle(8, 6, 0.3, [door(11, 2, 1)]);
    // A partition stops at the far jamb; its plaster stands 12 mm proud of the jamb and reaches a little into the door's depth.
    const parts = [...surveyParts(walls), { id: 50, kind: 'wall' as const, rings: [rect(2.988, 0.19, 3.112, 3)] }];
    const p = planDimensions(parts, SETTINGS);
    assert.equal(openingsMatch(p, walls), 1);
  });

  it('dimensions an L from outside, losing none of its strings at the inner corner', () => {
    // The notch is 4 x 3 at the north-east: the short walls' strings end on the wall of the other wing.
    const walls: SurveyWall[] = [
      { id: 1, start: { x: 0, y: 0 }, degrees: 0, length: 12, thickness: 0.3, openings: [window_(11, 2, 2), door(12, 7, 1)] },
      { id: 2, start: { x: 12, y: 0.3 }, degrees: 90, length: 5.7, thickness: 0.3, openings: [window_(13, 2, 1.5)] },
      { id: 3, start: { x: 12, y: 6 }, degrees: 180, length: 4, thickness: 0.3, openings: [window_(14, 1, 2)] },
      { id: 4, start: { x: 8, y: 6 }, degrees: 90, length: 3, thickness: 0.3, openings: [window_(15, 1, 1)] },
      { id: 5, start: { x: 8, y: 9 }, degrees: 180, length: 8, thickness: 0.3, openings: [window_(16, 2, 2)] },
      { id: 6, start: { x: 0, y: 8.7 }, degrees: 270, length: 8.4, thickness: 0.3, openings: [window_(17, 3, 1)] },
    ];
    const p = plan(walls);
    assert.equal(p.droppedStrings, 0);
    assert.equal(openingsMatch(p, walls), 7);
    close(overalls(p), [3, 4, 6, 8, 9, 12], 'each side of the L');
  });

  it('prints no figure per material layer, and takes the layered wall whole', () => {
    const layers = [0.14, 0.12, 0.04];
    const walls = rectangle(8, 6, 0.3, [door(11, 1.5, 0.9, [0.03, 0.03])], [window_(12, 2, 0.6)]).map((w) => ({ ...w, layers }));
    const p = plan(walls);
    assert.equal(openingsMatch(p, walls), 2);
    close(overalls(p), [6, 8], 'the overall');
    const all = p.strings.flatMap(spans);
    for (const layer of [...layers, 0.26]) assert.ok(!all.some((v) => Math.abs(v - layer) < MM), `a ${layer} span in ${all.join()}`);
  });

  it('prints the width of a round window, which the plan cuts short of it', () => {
    const walls = rectangle(10, 6, 0.3, [{ ...window_(11, 4.02, 0.96), bodyWidth: 1 }]);
    const p = plan(walls);
    assert.equal(openingsMatch(p, walls), 1);
  });

  it('dimensions both of two walls that stand apart, each from outside (two gables under a roof)', () => {
    const walls: SurveyWall[] = [
      { id: 1, start: { x: 12, y: 1 }, degrees: 90, length: 7.5, thickness: 0.3, openings: [window_(11, 3, 1)] },
      { id: 2, start: { x: 0, y: 8.5 }, degrees: 270, length: 7.5, thickness: 0.3, openings: [window_(12, 3, 1)] },
    ];
    const p = plan(walls);
    assert.equal(openingsMatch(p, walls), 2);
    close(overalls(p), [7.5, 7.5], 'one overall on the outer side of each wall');
    const across = p.strings.filter((s) => s.kind === 'overall').map((s) => s.points[0].x + s.outward.x * s.offset);
    assert.ok(across.some((x) => x > 12) && across.some((x) => x < 0), `each string stands outside its wall: ${across.join()}`);
  });

  it('leaves out a wing at an angle and says how many strings, instead of measuring it along the wrong axis', () => {
    // A 10 x 6 house, and on its east side a wing turned by 6 degrees with a door in it.
    const house = rectangle(10, 6, 0.3, [door(11, 2, 1)]);
    const wing: SurveyWall[] = [
      { id: 21, start: { x: 10, y: 1 }, degrees: 6, length: 5, thickness: 0.3, openings: [door(22, 2, 1.06, [0.04, 0.04])] },
      { id: 23, start: { x: 10 + 5 * Math.cos(Math.PI / 30), y: 1 + 5 * Math.sin(Math.PI / 30) }, degrees: 96, length: 4, thickness: 0.3 },
      { id: 24, start: { x: 10 + 5 * Math.cos(Math.PI / 30) - 4 * Math.sin(Math.PI / 30), y: 1 + 5 * Math.sin(Math.PI / 30) + 4 * Math.cos(Math.PI / 30) }, degrees: 186, length: 5, thickness: 0.3 },
    ];
    const p = plan([...house, ...wing]);
    assert.ok(Math.abs(p.angle) < 1e-9, 'the house decides the frame, not the wing');
    assert.ok(p.droppedStrings > 0, 'the facades of the wing are left out and counted');
    const measured = p.strings.flatMap((s) => s.measures);
    assert.ok(!measured.includes(22), 'the door of the turned wall gets no figure from a box in the wrong frame');
    assert.ok(measured.includes(11), 'the house keeps its door');
    // Every string stands square to the house.
    for (const s of p.strings) assert.ok(Math.abs(s.along.x * s.along.y) < 1e-9, `${s.key} runs along ${JSON.stringify(s.along)}`);
  });

  it('keeps the true corners when plaster and walls stand within a grid tolerance of each other', () => {
    // A 25 mm plaster coat round a 22.65 x 13.65 block, the walls under it 4 mm and 8 mm off one line: averaging the lines moved a corner by 6 mm.
    const parts = [
      part('wall', rect(0, 0, 8, 0.35)), part('wall', rect(10, 0, 22.65, 0.35)), part('window', rect(8, 0.1, 10, 0.2)),
      part('wall', rect(0, 13.3, 22.65, 13.65)), part('wall', rect(0, 0.35, 0.35, 13.3)), part('wall', rect(22.3, 0.35, 22.65, 13.3)),
      part('wall', rect(-0.025, -0.025, 22.675, 0)), part('wall', rect(-0.025, 13.65, 22.675, 13.675)),
      part('wall', rect(-0.025, 0, 0, 13.65)), part('wall', rect(22.65, 0, 22.675, 13.65)),
      part('wall', rect(-0.021, 5, -0.012, 5.6)), part('wall', rect(-0.017, 7, -0.012, 7.6)),
    ];
    const p = planDimensions(parts, SETTINGS);
    const south = p.strings.find((s) => s.kind === 'overall');
    assert.ok(south, 'the south side has its overall');
    close(spans(south), [22.7], 'corner to corner, plaster on plaster');
  });

  it('keeps the last point of a string when a wall face stands within 5 mm of the end', () => {
    const walls = rectangle(8, 6, 0.3, [window_(11, 6.5, 1.497)]);
    const p = plan(walls);
    const inner = p.strings.find((s) => s.kind === 'inner');
    assert.ok(inner);
    const sum = spans(inner).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 8) <= MM, `the chain runs corner to corner: ${sum}`);
  });
});

describe('DIMALL leaves out what it cannot measure', () => {
  it('gives a wall a few degrees off the plan no figures, and counts it', () => {
    // The east wall of a 10 x 6 house leans out by 2 degrees, with a door in it; its box in the plan's frame is 0.5 m wide.
    const walls = rectangle(10, 6, 0.3, [door(11, 2, 1)]);
    const east = walls[1];
    walls[1] = { ...east, start: { x: 10, y: 0 }, degrees: 88, length: 6, openings: [door(12, 2, 1.06, [0.04, 0.04])] };
    const p = plan(walls);
    assert.ok(p.droppedStrings > 0, 'the leaning facade is reported');
    const measured = p.strings.flatMap((s) => s.measures);
    assert.ok(!measured.includes(12), 'the door in the leaning wall has no figure');
    for (const s of p.strings) assert.ok(!(s.outward.x > 0.5), `${s.key} stands on the leaning side`);
  });

  it('gives a wall a fraction of a degree off the plan no figures either: its box would still look like a wall', () => {
    const walls = rectangle(10, 6, 0.3, [door(11, 2, 1)]);
    const east = walls[1];
    walls[1] = { ...east, start: { x: 10, y: 0 }, degrees: 89.7, length: 6, openings: [door(12, 2, 1.06, [0.04, 0.04])] };
    const p = plan(walls);
    assert.ok(!p.strings.flatMap((s) => s.measures).includes(12), 'the door in the leaning wall has no figure');
    assert.ok(p.droppedStrings > 0, 'the leaning side is reported');
  });

  it('takes a plaster coat broken at each window as one facade, standing on its outermost face', () => {
    const parts = [
      part('wall', rect(0, 0, 3, 0.3)), part('wall', rect(5, 0, 10, 0.3)), part('window', rect(3, 0.1, 5, 0.2)),
      part('wall', rect(0, 5.7, 10, 6)), part('wall', rect(0, 0.3, 0.3, 5.7)), part('wall', rect(9.7, 0.3, 10, 5.7)),
      part('wall', rect(5, -0.025, 10, 0)),
    ];
    const p = planDimensions(parts, SETTINGS);
    const south = p.strings.filter((s) => s.kind === 'overall' && s.outward.y < -0.5);
    assert.equal(south.length, 1, south.map((s) => s.key).join());
    close(spans(south[0]), [10], 'the south side');
    assert.ok(Math.abs(south[0].points[0].y - -0.025) <= MM, `stands on the plaster: ${south[0].points[0].y}`);
  });

  it('never reads a gate across its thickness', () => {
    const walls = rectangle(10, 6, 0.3);
    const parts = [...surveyParts(walls), part('wall', rect(4.5, -3, 4.7, 0)), { id: 60, kind: 'door' as const, rings: [rect(4, -2, 5.85, -1.8)] }];
    const p = planDimensions(parts, SETTINGS);
    assert.ok(!p.strings.flatMap((s) => s.measures).includes(60), 'a gate 1.85 long and 0.2 deep prints no 0.20');
  });

  it('keeps the strings of an L whichever way it faces: the end of a string on the other wing is not through it', () => {
    for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const parts = lShape().map((q) => ({ ...q, rings: q.rings.map((r) => r.map((v) => ({ x: fx * v.x, y: fy * v.y }))) }));
      const p = planDimensions(parts, SETTINGS);
      assert.equal(p.droppedStrings, 0, `facing ${fx},${fy}: ${p.strings.map((s) => s.key).join()}`);
    }
  });

  it('dimensions the house and not a boundary wall standing in front of it', () => {
    const walls = rectangle(10, 6, 0.3, [door(11, 2, 1)]);
    const p = planDimensions([...surveyParts(walls), part('wall', rect(-5, -4, 15, -3.8))], SETTINGS);
    assert.ok(p.strings.flatMap((s) => s.measures).includes(11), 'the door of the south side, which faces the boundary wall');
  });

  it('takes a stub of wall for a jamb rather than the plaster of a wall beyond it', () => {
    // A double door 1.70: a stub 0.11 square each side, and past the far one a partition whose plaster stands 12 mm proud of the jamb.
    const walls = rectangle(8, 6, 0.3);
    const parts = surveyParts(walls).filter((q) => q.id !== 100);
    const wide = { id: 70, kind: 'door' as const, rings: [rect(1.8, 0.1, 3.5, 0.2)] };
    const all = [...parts, part('wall', rect(0, 0, 1.69, 0.3)), part('wall', rect(1.69, 0, 1.8, 0.22)), part('wall', rect(3.5, 0, 3.61, 0.22)), part('wall', rect(3.61, 0, 8, 0.3)), part('wall', rect(3.488, 0.05, 3.6, 3)), wide];
    const p = planDimensions(all, SETTINGS);
    const span = p.strings.flatMap((s) => spans(s).filter((_, k) => s.measures[k] === 70));
    close(span, [1.7], 'the double door');
  });

  it('leaves out a door at an angle with no jamb to read, and says so', () => {
    const c = Math.cos(0.1), s = Math.sin(0.1);
    const at = (x: number, y: number): Pt => ({ x: 4 + (x - 4) * c - (y - 0.15) * s, y: 0.15 + (x - 4) * s + (y - 0.15) * c });
    const leaning = { id: 80, kind: 'door' as const, rings: [[at(3.45, 0.13), at(4.55, 0.13), at(4.55, 0.17), at(3.45, 0.17)]] };
    const walls = rectangle(8, 6, 0.3);
    const parts = [...surveyParts(walls).filter((q) => q.id !== 100), part('wall', rect(0, 0, 3.44, 0.3), rect(5, 0, 8, 0.3)), leaning];
    const p = planDimensions(parts, SETTINGS);
    assert.equal(p.droppedOpenings, 1);
    assert.ok(!p.strings.flatMap((q) => q.measures).includes(80), 'no figure for it');
  });
});

describe('the frame of the plan', () => {
  it('is the direction of the walls, not the mean of everything on the plan', () => {
    const rings = surveyParts(rectangle(10, 17, 0.3)).flatMap((p) => p.rings);
    // A slanted jamb and a short wall at 3 degrees pulled the mean to 0.06 degrees: 18 mm of error in 17 m.
    const slant: Pt[] = [{ x: 3, y: 3 }, { x: 11, y: 3.46 }, { x: 11, y: 3.6 }, { x: 3, y: 3.14 }];
    assert.equal(mainDirection([...rings, slant]), 0);
  });
  it('counts the zero-area diagonal of a mitred layer as on the axes, and a turned wall as off them', () => {
    assert.equal(ringOnAxes([{ x: 8.44, y: 17.44 }, { x: 8.5, y: 17.5 }, { x: 8.633, y: 17.633 }, { x: 8.5, y: 17.5 }], 0.1), true);
    const c = Math.cos(0.1), s = Math.sin(0.1);
    assert.equal(ringOnAxes(rect(0, 0, 5, 0.3).map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })), 0.1), false);
    assert.equal(ringOnAxes(rect(0, 0, 5, 0.3), 0.1), true);
  });
  it('is exact on a building turned by any angle', () => {
    for (const deg of [6, 42.02, -30]) {
      const rings = surveyParts(turnedBy(rectangle(10, 7, 0.3), deg)).flatMap((p) => p.rings);
      const got = (mainDirection(rings) * 180) / Math.PI;
      assert.ok(Math.abs(got - deg) < 1e-6, `${deg}: ${got}`);
    }
  });
});

describe('walls cut in pieces', () => {
  const join = (...rings: ReturnType<typeof rect>[]) => joinLayers(rings.map(boxOf));
  it('takes a finish that covers only part of the wall into it', () => {
    assert.deepEqual(join(rect(4, 0, 4.1, 3), rect(4.1, 0.2, 4.112, 2.7)), [{ x0: 4, y0: 0, x1: 4.112, y1: 3 }]);
  });
  it('takes the corner of a mitred layer into the wall, whichever way it runs', () => {
    assert.deepEqual(join(rect(0, 0, 0.3, 5), rect(0.3, 4.8, 0.45, 4.95)), [{ x0: 0, y0: 0, x1: 0.45, y1: 5 }]);
  });
  it('does not read what an opening leaves of a wall as a cross wall', () => {
    // A corner piece 0.42 x 0.42; beside it, 0.82 long and 0.19 thick, the inner layer the window did not cut.
    const boxes = join(rect(8.38, 17.38, 8.8, 17.8), rect(7.56, 17.44, 8.38, 17.63));
    assert.deepEqual(boxes, [{ x0: 8.38, y0: 17.38, x1: 8.8, y1: 17.8 }]);
  });
  it('closes the gap of an opening that holds no door or window', () => {
    assert.deepEqual(wallGaps(joinLayers([rect(0, 0, 2, 0.3), rect(4, 0, 6, 0.3)].map(boxOf))), [{ x0: 2, x1: 4, y0: 0, y1: 0.3 }]);
    assert.deepEqual(wallGaps(joinLayers([rect(0, 0, 2, 0.3), rect(4, 0.1, 6, 0.4)].map(boxOf))), [], 'not across a step');
  });
  it('keeps the outline outside a room behind an unfilled opening', () => {
    const walls = rectangle(8, 6, 0.3).map((w) => (w.id === 100 ? { ...w, openings: [] } : w));
    const parts = surveyParts(walls);
    const south = parts.find((q) => q.id === 100);
    assert.ok(south);
    south.rings = [rect(0, 0, 3, 0.3), rect(5, 0, 8, 0.3)];
    const p = planDimensions(parts, SETTINGS);
    const ys = p.outline.map((q) => q.y);
    assert.equal(Math.min(...ys), 0);
    assert.ok(!ys.some((y) => Math.abs(y - 0.3) < 1e-6), `the outline runs along the wall's outer face only: ${ys.join()}`);
  });
});

describe('what the plan reads off its drawing', () => {
  const plane = { axis: 'y', flipped: false } as const;
  const polygon = (entityId: number, ifcType: string) => ({ entityId, ifcType, polygon: { outer: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], holes: [] } });
  const drawing = (...cutPolygons: ReturnType<typeof polygon>[]) => ({ cutPolygons, config: { plane } }) as unknown as Parameters<typeof planParts>[0];

  it('never reads a type for an element', () => {
    for (const t of ['IfcWallType', 'IFCWALLTYPE', 'IfcDoorType', 'IfcWindowType', 'IfcDoorStyle', 'IfcWindowStyle', 'IfcCurtainWallType']) assert.equal(kindOfClass(t), null, t);
    for (const [t, k] of [['IfcWall', 'wall'], ['IfcWallStandardCase', 'wall'], ['IfcCurtainWall', 'wall'], ['IfcDoor', 'door'], ['IfcWindow', 'window']] as const) assert.equal(kindOfClass(t), k, t);
  });

  it('gives a window the whole of its mesh, placed as the cut is, and a wall none', () => {
    const mesh = (expressId: number, positions: number[], origin?: [number, number, number], geometryClass?: number) => ({ expressId, positions: new Float32Array(positions), origin, geometryClass }) as never;
    const parts = planParts(drawing(polygon(1, 'IfcWindow'), polygon(2, 'IfcWall'), polygon(3, 'IfcDoor')), [
      mesh(1, [1, 5, 2, 2, 9, 3], [10, 0, 20]),
      mesh(2, [0, 0, 0]),
      mesh(3, [7, 7, 7], [0, 0, 0], 2),
    ]);
    assert.deepEqual(parts.find((p) => p.id === 1)?.body, [{ x: 11, y: 22 }, { x: 12, y: 23 }], 'x and z of the mesh, with its origin');
    assert.equal(parts.find((p) => p.id === 2)?.body, undefined);
    assert.equal(parts.find((p) => p.id === 3)?.body, undefined, 'a type template is not the body');
  });
});
