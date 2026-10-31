/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Room dimensions (#638). Every printed figure is compared with a value computed in the test from the rings of the walls
 * themselves (a wall face is a coordinate of a ring), never with what `rooms.ts` reads, and every figure and line is
 * checked by box against the walls, the obstacles and the other chains.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout } from '@/drafting/annotation';
import { textBlock } from '@/drafting/text-block';
import type { Pt } from '@/drafting/types';
import { layeredHouse, lShape, part, rect, turned } from './fixture';
import { planRoomChains, type RoomInput, type RoomPlan } from './rooms';
import type { PlanPart } from './types';

const H = 0.25;
const MM = 0.001;
const plan = (parts: readonly PlanPart[], rooms: readonly RoomInput[], obstacles: { x0: number; y0: number; x1: number; y1: number; crossable?: boolean }[] = [], lines: { a: Pt; b: Pt }[] = []) => planRoomChains(parts, rooms, { textHeight: H, obstacles, lines });
const room = (id: string, x0: number, y0: number, x1: number, y1: number): RoomInput => ({ id, ring: rect(x0, y0, x1, y1) });
type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** What the figure of a chain covers on the plan, in a plan not turned: its text, either side of the line. */
function figureBox(p: RoomPlan, i: number): Box {
  const s = p.shapes[i], layout = dimensionLayout(s);
  const w = textBlock(layout.label, H).outer.x1;
  const horizontal = Math.abs(s.b.x - s.a.x) > Math.abs(s.b.y - s.a.y);
  const c = layout.textAt;
  return horizontal ? { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y - 1.05 * H, y1: c.y + 1.05 * H } : { x0: c.x - 1.05 * H, x1: c.x + 1.05 * H, y0: c.y - w / 2, y1: c.y + w / 2 };
}
const lineBox = (p: RoomPlan, i: number): Box => ({ x0: Math.min(p.chains[i].a.x, p.chains[i].b.x) - 0.01, x1: Math.max(p.chains[i].a.x, p.chains[i].b.x) + 0.01, y0: Math.min(p.chains[i].a.y, p.chains[i].b.y) - 0.01, y1: Math.max(p.chains[i].a.y, p.chains[i].b.y) + 0.01 });
const wallBoxes = (parts: readonly PlanPart[]): Box[] => parts.filter((q) => q.kind === 'wall').flatMap((q) => q.rings.map((r) => ({ x0: Math.min(...r.map((v) => v.x)), x1: Math.max(...r.map((v) => v.x)), y0: Math.min(...r.map((v) => v.y)), y1: Math.max(...r.map((v) => v.y)) })));
const chainOf = (p: RoomPlan, id: string, dir: 'x' | 'y') => p.chains.findIndex((c) => c.room === id && c.dir === dir);
const printed = (p: RoomPlan, i: number) => dimensionLayout(p.shapes[i]).label;

/** The two faces of a room along x, read off the rings of two walls: the east face of the one, the west face of the other. */
const gapX = (west: PlanPart, east: PlanPart) => Math.min(...east.rings.flat().map((v) => v.x)) - Math.max(...west.rings.flat().map((v) => v.x));
const gapY = (south: PlanPart, north: PlanPart) => Math.min(...north.rings.flat().map((v) => v.y)) - Math.max(...south.rings.flat().map((v) => v.y));

/** A closed rectangular room of 0.3 m walls, 6.0 x 4.5, from four wall parts: south, north, west, east. */
function box() {
  const [s, n, w, e] = [part('wall', rect(0, 0, 6, 0.3)), part('wall', rect(0, 4.2, 6, 4.5)), part('wall', rect(0, 0.3, 0.3, 4.2)), part('wall', rect(5.7, 0.3, 6, 4.2))];
  return { s, n, w, e, parts: [s, n, w, e] };
}

describe('room dimensions: the figures', () => {
  it('prints the clear width and depth of a rectangular room, from the walls', () => {
    const b = box();
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    const [x, y] = [chainOf(p, 'r1', 'x'), chainOf(p, 'r1', 'y')];
    assert.ok(x >= 0 && y >= 0 && p.dropped === 0, `chains ${p.chains.length}, dropped ${p.dropped}`);
    assert.equal(printed(p, x), gapX(b.w, b.e).toFixed(2));
    assert.equal(printed(p, y), gapY(b.s, b.n).toFixed(2));
    assert.ok(Math.abs(p.chains[x].length - gapX(b.w, b.e)) < MM && Math.abs(p.chains[y].length - gapY(b.s, b.n)) < MM);
    // The chain ends on the faces: the ring's own x and y.
    const [a, c] = [p.chains[x].a, p.chains[x].b];
    assert.ok(Math.abs(Math.min(a.x, c.x) - 0.3) < MM && Math.abs(Math.max(a.x, c.x) - 5.7) < MM);
  });

  it('does not read the figure off the space: a space drawn to the wall axes still gives the clear size', () => {
    const b = box();
    const p = plan(b.parts, [room('r1', 0.15, 0.15, 5.85, 4.35)]);
    assert.equal(printed(p, chainOf(p, 'r1', 'x')), gapX(b.w, b.e).toFixed(2));
    assert.equal(printed(p, chainOf(p, 'r1', 'y')), gapY(b.s, b.n).toFixed(2));
  });

  it('keeps the clear size where a door and a window open the walls', () => {
    const b = box();
    const parts = [
      part('wall', rect(0, 0, 1, 0.3)), part('wall', rect(1.9, 0, 6, 0.3)), b.n, b.w, part('wall', rect(5.7, 0.3, 6, 1.5)), part('wall', rect(5.7, 2.7, 6, 4.2)),
      part('door', rect(1.0, 0.1, 1.9, 0.2)), part('window', rect(5.8, 1.5, 5.9, 2.7)),
    ];
    const p = plan(parts, [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    assert.equal(p.dropped, 0);
    assert.equal(printed(p, chainOf(p, 'r1', 'x')), (5.7 - 0.3).toFixed(2));
    assert.equal(printed(p, chainOf(p, 'r1', 'y')), (4.2 - 0.3).toFixed(2));
    // The line does not stand in a wall's gap: the faces it ends on are walls, so it avoids the door's and the window's span.
    const x = chainOf(p, 'r1', 'x'), y = chainOf(p, 'r1', 'y');
    assert.ok(!(p.chains[x].a.y < 0.3), 'not in the south wall');
    assert.ok(!(p.chains[y].a.x > 5.7));
  });

  it('measures the layered-wall house between the faces of the whole wall: its innermost layer, not the structural core', () => {
    const house = layeredHouse();
    const [south, , west, east, cross] = house;
    const living = room('living', 0.3, 0.3, 3.7, 5.7), kitchen = room('kitchen', 4, 0.3, 7.7, 5.7);
    const p = plan(house, [living, kitchen]);
    assert.equal(p.dropped, 0, 'nothing left out');
    // The faces are coordinates of the wall rings: the west wall's layers end at 0.3, the cross wall's start at 3.7 and end at 4.0, the east wall's start at 7.7.
    const faceW = Math.max(...west.rings.flat().map((v) => v.x)), crossW = Math.min(...cross.rings.flat().map((v) => v.x)), crossE = Math.max(...cross.rings.flat().map((v) => v.x)), faceE = Math.min(...east.rings.flat().map((v) => v.x));
    assert.deepEqual([faceW, crossW, crossE, faceE], [0.3, 3.7, 4, 7.7]);
    assert.equal(printed(p, chainOf(p, 'living', 'x')), (crossW - faceW).toFixed(2));
    assert.equal(printed(p, chainOf(p, 'kitchen', 'x')), (faceE - crossE).toFixed(2));
    const faceS = Math.max(...south.rings.flat().map((v) => v.y)), faceN = Math.min(...house[1].rings.flat().map((v) => v.y));
    assert.equal(printed(p, chainOf(p, 'living', 'y')), (faceN - faceS).toFixed(2));
    assert.equal(printed(p, chainOf(p, 'kitchen', 'y')), (faceN - faceS).toFixed(2));
    // Not the 0.14 + 0.12 core only: the wall is 0.30 thick, so the size is 3.40 and not 3.54 or 3.66.
    assert.equal(printed(p, chainOf(p, 'living', 'x')), '3.40');
    assert.equal(printed(p, chainOf(p, 'kitchen', 'x')), '3.70');
  });

  it('reads the same on a building turned by 6 degrees', () => {
    const b = box();
    const angle = (6 * Math.PI) / 180;
    const rot = (q: Pt): Pt => ({ x: q.x * Math.cos(angle) - q.y * Math.sin(angle), y: q.x * Math.sin(angle) + q.y * Math.cos(angle) });
    const p = planRoomChains(turned(b.parts, angle), [{ id: 'r1', ring: rect(0.3, 0.3, 5.7, 4.2).map(rot) }], { textHeight: H, obstacles: [] });
    assert.equal(p.dropped, 0);
    assert.equal(printed(p, chainOf(p, 'r1', 'x')), '5.40');
    assert.equal(printed(p, chainOf(p, 'r1', 'y')), '3.90');
    const i = chainOf(p, 'r1', 'x');
    assert.ok(Math.abs(Math.hypot(p.chains[i].b.x - p.chains[i].a.x, p.chains[i].b.y - p.chains[i].a.y) - 5.4) < MM);
  });
});

describe('room dimensions: what is left out', () => {
  it('draws nothing and says so when the model has no rooms', () => {
    const p = plan(box().parts, []);
    assert.deepEqual([p.chains.length, p.dropped, p.noRooms], [0, 0, true]);
  });

  it('leaves out a room next to a wall at an angle to the plan, counting both chains', () => {
    const b = box();
    const slanted = part('wall', [{ x: 1, y: 1 }, { x: 2.5, y: 2.2 }, { x: 2.4, y: 2.3 }, { x: 0.9, y: 1.1 }]);
    const p = plan([...b.parts, slanted], [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    assert.deepEqual([p.chains.length, p.dropped], [0, 2]);
  });

  it('leaves out a room with no walls on its sides, and counts it', () => {
    const b = box();
    const p = plan([b.s, b.n], [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    assert.equal(p.chains.length, 1, 'the depth stands between the south and north walls');
    assert.deepEqual([p.dropped, printed(p, 0)], [1, '3.90']);
  });

  it('does not take a partition that stops short for a side', () => {
    const b = box();
    const partition = part('wall', rect(2.9, 0.3, 3.1, 3.3));
    const p = plan([...b.parts, partition], [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    const x = chainOf(p, 'r1', 'x');
    assert.ok(x >= 0);
    assert.equal(printed(p, x), '5.40');
    // The line stands past the partition's end (y 3.3), where nothing is in the way.
    assert.ok(p.chains[x].a.y > 3.3, `line at y ${p.chains[x].a.y}`);
  });

  it('leaves a chain out when everything round it is taken, and counts it', () => {
    const b = box();
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [{ x0: 0.3, y0: 0.3, x1: 5.7, y1: 4.2 }]);
    assert.deepEqual([p.chains.length, p.dropped], [0, 2]);
  });

  it('leaves out a figure that does not fit between the faces', () => {
    const narrow = [part('wall', rect(0, 0, 1.2, 0.3)), part('wall', rect(0, 4.2, 1.2, 4.5)), part('wall', rect(0, 0.3, 0.3, 4.2)), part('wall', rect(1.1, 0.3, 1.4, 4.2))];
    const p = plan(narrow, [room('r1', 0.3, 0.3, 1.1, 4.2)]);
    assert.equal(chainOf(p, 'r1', 'x'), -1, 'a 0.80 wide room has no room for its figure');
    assert.equal(p.dropped, 1);
  });
});

describe('room dimensions: what makes a side', () => {
  it('does not take a short stub of wall (a jamb) for the side of a room', () => {
    const b = box();
    const stubbed = [b.s, b.n, b.e, part('wall', rect(0, 2, 0.3, 2.3))];
    const p = plan(stubbed, [room('r1', 0.3, 0.3, 5.7, 4.2)]);
    assert.equal(chainOf(p, 'r1', 'x'), -1, 'no wall on the west side: no width');
    assert.equal(printed(p, chainOf(p, 'r1', 'y')), '3.90');
    assert.equal(p.dropped, 1);
  });

  it('keeps a line inside the room: a line that would cross the notch of a U-shaped space is not drawn', () => {
    const b = box();
    // The space leaves a 2 x 2 notch out of the top: the walls bound the whole box, the room does not fill it. The floor part is taken, so the only lines left run through the notch.
    const u: RoomInput = { id: 'u', ring: [{ x: 0.3, y: 0.3 }, { x: 5.7, y: 0.3 }, { x: 5.7, y: 4.2 }, { x: 4, y: 4.2 }, { x: 4, y: 2.2 }, { x: 2, y: 2.2 }, { x: 2, y: 4.2 }, { x: 0.3, y: 4.2 }] };
    const p = plan(b.parts, [u], [{ x0: 0.3, y0: 0.3, x1: 5.7, y1: 1.9 }]);
    assert.equal(chainOf(p, 'u', 'x'), -1);
  });
});

describe('room dimensions: a room that is not a rectangle', () => {
  // The 12 x 10 L: its inner faces are x 0.3..11.7 along the south arm (y 0.3..5.7) and x 0.3..7.0 along the north arm.
  const l = lShape();
  const ring: Pt[] = [{ x: 0.3, y: 0.3 }, { x: 11.7, y: 0.3 }, { x: 11.7, y: 5.7 }, { x: 7, y: 5.7 }, { x: 7, y: 9.7 }, { x: 0.3, y: 9.7 }];
  it('measures its overall sizes along lines where its two extreme sides are both walls', () => {
    const p = plan(l, [{ id: 'l', ring }]);
    const x = chainOf(p, 'l', 'x'), y = chainOf(p, 'l', 'y');
    assert.ok(x >= 0 && y >= 0, `dropped ${p.dropped}`);
    // Along x: west wall face 0.3 to east wall face 11.7, in the south arm; along y: south face 0.3 to north face 9.7, in the west arm.
    assert.equal(printed(p, x), (11.7 - 0.3).toFixed(2));
    assert.equal(printed(p, y), (9.7 - 0.3).toFixed(2));
    assert.ok(Math.max(p.chains[x].a.y, p.chains[x].b.y) < 5.7, 'the line stands in the south arm');
    assert.ok(Math.max(p.chains[y].a.x, p.chains[y].b.x) < 7, 'the line stands in the west arm');
  });
});

describe('room dimensions: nothing is printed over anything', () => {
  const b = box();
  const label = { x0: 2, y0: 1.5, x1: 4, y1: 3 };
  // A section's cut line through the middle of the room: a drawing line, vertical at x 3.
  const cutLine = { a: { x: 3, y: 0 }, b: { x: 3, y: 4.5 } };
  const cut = { x0: 2.99, y0: 0, x1: 3.01, y1: 4.5 };
  const walls = wallBoxes(b.parts);

  it('keeps the figures and lines off a room label, a symbol and a section line, and off the other chain', () => {
    const symbol = { x0: 0.3, y0: 0.3, x1: 1.4, y1: 1.4 };
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [label, symbol], [cutLine]);
    assert.equal(p.chains.length, 2, `dropped ${p.dropped}`);
    for (let i = 0; i < p.chains.length; i++) {
      const fig = figureBox(p, i);
      for (const o of [label, symbol, cut]) assert.ok(!hit(fig, o), `figure ${i} over ${JSON.stringify(o)}`);
      for (const o of [label, symbol]) assert.ok(!hit(lineBox(p, i), o), `line ${i} over ${JSON.stringify(o)}`);
      for (const w of walls) assert.ok(!hit(fig, w), `figure ${i} in a wall`);
      for (let j = 0; j < p.chains.length; j++) if (j !== i) assert.ok(!hit(fig, figureBox(p, j)) && !hit(fig, lineBox(p, j)), `figure ${i} over chain ${j}`);
      assert.equal(printed(p, i), i === chainOf(p, 'r1', 'x') ? '5.40' : '3.90');
    }
  });

  it('slides a figure along its line off the section line that crosses the middle of the room, and the line crosses it', () => {
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [], [cutLine]);
    const x = chainOf(p, 'r1', 'x');
    const fig = figureBox(p, x);
    assert.ok(!hit(fig, cut));
    assert.ok(hit(lineBox(p, x), cut), 'the line itself runs across the cut line');
    assert.ok(Math.abs((fig.x0 + fig.x1) / 2 - 3) > 0.2, 'the figure is no longer at the middle');
  });

  it('keeps the chains of every room of the layered house clear of each other, of the labels and of the walls', () => {
    const house = layeredHouse();
    const labels = [{ x0: 1.2, y0: 2.5, x1: 2.6, y1: 3.4 }, { x0: 5, y0: 2.5, x1: 6.4, y1: 3.4 }];
    const p = plan(house, [room('living', 0.3, 0.3, 3.7, 5.7), room('kitchen', 4, 0.3, 7.7, 5.7)], labels);
    assert.equal(p.chains.length, 4);
    const w = wallBoxes(house);
    for (let i = 0; i < 4; i++) {
      for (const o of labels) assert.ok(!hit(figureBox(p, i), o) && !hit(lineBox(p, i), o));
      // The cross wall's door frame, drawn thin in the wall, is not a wall to clear; the whole-wall boxes of the others are.
      for (const q of w) if (q.x1 - q.x0 > 0.05 && q.y1 - q.y0 > 0.05) assert.ok(!hit(figureBox(p, i), q), `figure ${i} in a wall`);
      for (let j = 0; j < 4; j++) if (j !== i) assert.ok(!hit(figureBox(p, i), figureBox(p, j)) && !hit(figureBox(p, i), lineBox(p, j)));
    }
  });

  it('never runs a dimension line along a line the drawing already has, or puts a figure on one', () => {
    // A dashed line (a hidden door head) on each face of the walls of the room, and one across the room's middle, 0.55 m above the south face.
    const along = { a: { x: 0.3, y: 0.85 }, b: { x: 5.7, y: 0.85 } };
    const vertical = { a: { x: 2, y: 0.3 }, b: { x: 2, y: 4.2 } };
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [], [along, vertical]);
    assert.equal(p.chains.length, 2, `dropped ${p.dropped}`);
    for (let i = 0; i < 2; i++) {
      assert.ok(!hit(figureBox(p, i), { x0: 0.3, x1: 5.7, y0: 0.84, y1: 0.86 }) && !hit(figureBox(p, i), { x0: 1.99, x1: 2.01, y0: 0.3, y1: 4.2 }), `figure ${i} on a drawn line`);
    }
    // The horizontal chain's line is not on y = 0.85.
    const x = chainOf(p, 'r1', 'x');
    assert.ok(Math.abs(p.chains[x].a.y - 0.85) > 0.04, `line at y ${p.chains[x].a.y}`);
  });

  it('keeps a figure off an overlay line that crosses it even where the dimension line may cross that line', () => {
    const over = { x0: 2.99, y0: 0, x1: 3.01, y1: 4.5, crossable: true };
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [over]);
    const x = chainOf(p, 'r1', 'x');
    assert.ok(x >= 0 && !hit(figureBox(p, x), over), 'the figure is not on it');
    assert.ok(hit(lineBox(p, x), over), 'the line runs across it');
  });

  it('does not draw a dimension line along an overlay line either', () => {
    // A dashed overlay along the first place a line could stand (0.65 above the south face's 0.3), over the left end only.
    const over = { x0: 0.3, y0: 0.64, x1: 1.0, y1: 0.66, crossable: true };
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [over]);
    const x = chainOf(p, 'r1', 'x');
    assert.ok(x >= 0);
    assert.ok(!hit(lineBox(p, x), over), `line at y ${p.chains[x].a.y}`);
  });

  it('does not draw a dimension line along a drawn line that covers only part of it', () => {
    const along = { a: { x: 0.3, y: 0.65 }, b: { x: 1.0, y: 0.65 } };
    const p = plan(b.parts, [room('r1', 0.3, 0.3, 5.7, 4.2)], [], [along]);
    const x = chainOf(p, 'r1', 'x');
    assert.ok(x >= 0);
    assert.ok(Math.abs(p.chains[x].a.y - 0.65) > 0.04, `line at y ${p.chains[x].a.y}`);
  });
});
