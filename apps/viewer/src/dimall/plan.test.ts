/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDimensions, stringLine } from './plan.js';
import { house, lShape, mitred, rect, part, turned } from './fixture.js';
import type { PlannedString, PlanPart } from './types.js';

const settings = { paperUnit: 0.1, textHeight: 0.25 };
const lengths = (s: PlannedString) => s.points.slice(1).map((p, i) => +Math.hypot(p.x - s.points[i].x, p.y - s.points[i].y).toFixed(3));
const facing = (plan: ReturnType<typeof planDimensions>, nx: number, ny: number, kind: string) =>
  plan.strings.find((s) => s.kind === kind && Math.round(s.outward.x) === nx && Math.round(s.outward.y) === ny);
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} is not ${b}`);

describe('planDimensions', () => {
  it('strings the south facade: corners, window edges and cross-wall faces, then the overall', () => {
    const plan = planDimensions(house(), settings);
    const inner = facing(plan, 0, -1, 'inner')!;
    assert.deepEqual(lengths(inner), [0.3, 0.7, 2, 2, 2, 0.4, 0.24, 4.06, 0.3]);
    assert.deepEqual(lengths(facing(plan, 0, -1, 'overall')!), [12]);
    close(lengths(inner).reduce((a, b) => a + b, 0), 12);
  });

  it('puts a middle string between the cross-wall axes and stacks 12 mm, then 8 mm apart on paper', () => {
    const plan = planDimensions(house(), settings);
    const south = plan.strings.filter((s) => Math.round(s.outward.y) === -1);
    assert.deepEqual(south.map((s) => s.kind), ['inner', 'middle', 'overall']);
    assert.deepEqual(south.map((s) => +(s.offset / 0.1).toFixed(6)), [12, 20, 28]);
    assert.deepEqual(lengths(south[1]), [7.52, 4.48]);
  });

  it('stacks by paper distance at another scale', () => {
    const plan = planDimensions(house(), { paperUnit: 0.05, textHeight: 0.1 });
    close(plan.strings[0].offset, 0.6, 1e-9);
  });

  it('skips the sides with nothing to dimension', () => {
    const plan = planDimensions(house(), settings);
    assert.equal(facing(plan, -1, 0, 'inner'), undefined);
    assert.equal(plan.skippedFacades, 1);
    assert.ok(facing(plan, 1, 0, 'inner'));
    assert.ok(facing(plan, 0, 1, 'inner'));
  });

  it('measures the door edges on the east wall', () => {
    assert.deepEqual(lengths(facing(planDimensions(house(), settings), 1, 0, 'inner')!), [0.3, 3.7, 1, 4.7, 0.3]);
  });

  it('is deterministic', () => {
    // The same parts (part ids are the elements' own, so a fresh house would be other elements).
    const parts = house();
    assert.deepEqual(planDimensions(parts, settings), planDimensions(parts, settings));
  });

  it('dimensions each straight run of an L-shaped outline', () => {
    const plan = planDimensions(lShape(), settings);
    const overall = plan.strings.filter((s) => s.kind === 'overall').map((s) => lengths(s)[0]).sort((a, b) => a - b);
    assert.ok(overall.includes(12) && overall.includes(10), String(overall));
    assert.equal(plan.outline.length, 6);
  });

  it('runs the strings along the facade of a building turned off the axes', () => {
    const angle = (30 * Math.PI) / 180;
    const plan = planDimensions(turned(house(), angle), settings);
    close(plan.angle, angle);
    assert.deepEqual(plan.strings.map(lengths), planDimensions(house(), settings).strings.map(lengths));
    const s = plan.strings[0];
    close(s.along.x * s.outward.x + s.along.y * s.outward.y, 0, 1e-9);
  });

  it('takes the outline of walls that meet at mitres as a plain rectangle', () => {
    const plan = planDimensions(mitred(), settings);
    assert.equal(plan.outline.length, 4);
    assert.deepEqual(lengths(facing(plan, 0, -1, 'overall')!), [8]);
  });

  it('plans nothing for a plan without walls', () => {
    assert.deepEqual(planDimensions([part('window', rect(0, 0, 1, 0.2))], settings).strings, []);
  });
});

describe('strings of different facades', () => {
  const orient = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = (p: { a: { x: number; y: number }; b: { x: number; y: number } }, q: typeof p) =>
    orient(p.a, p.b, q.a) * orient(p.a, p.b, q.b) < -1e-9 && orient(q.a, q.b, p.a) * orient(q.a, q.b, p.b) < -1e-9;
  for (const [name, parts] of [['house', house()], ['L', lShape()], ['turned L', turned(lShape(), 0.4)]] as const) {
    it(`never cross each other on the ${name}`, () => {
      const lines = planDimensions(parts, settings).strings.map(stringLine);
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) assert.ok(!crosses(lines[i], lines[j]), `strings ${i} and ${j} cross`);
    });
  }
});

describe('the ground plan of the FZK-Haus sample (cut outlines read from its generated drawing; walls are cut at a mitre)', () => {
  const parts = JSON.parse(readFileSync(new URL('./fzk-ground-plan.json', import.meta.url), 'utf8')) as PlanPart[];
  const plan = planDimensions(parts, settings);

  it('finds the 12 x 10 outline, not the mitres or the rooms', () => {
    assert.equal(plan.outline.length, 4);
    const xs = plan.outline.map((p) => p.x), ys = plan.outline.map((p) => p.y);
    close(Math.max(...xs) - Math.min(...xs), 12, 0.01);
    close(Math.max(...ys) - Math.min(...ys), 10, 0.01);
  });

  it('gives each of the four facades strings whose spans add up to the overall', () => {
    assert.equal(plan.strings.filter((s) => s.kind === 'overall').length, 4);
    for (const overall of plan.strings.filter((s) => s.kind === 'overall')) {
      const total = lengths(overall)[0];
      for (const s of plan.strings.filter((t) => t.key.split(':')[1] === overall.key.split(':')[1])) close(lengths(s).reduce((a, b) => a + b, 0), total, 0.01);
    }
  });
});
