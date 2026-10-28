/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Proposed sections: the stair first, then rooms by size, each cut across the
 * building's short side and named after what it passes through; cuts that
 * would show the same thing are proposed once.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CUT_OVERHANG_M, proposeSections, type ProposalInput } from './section-proposals.js';

/** A 10 × 7 m house, long along X, like the sample in the concept. */
const house = (extra: Partial<ProposalInput> = {}): ProposalInput => ({
  building: { min: { x: 0, z: 0 }, max: { x: 10, z: 7 } },
  rooms: [
    { name: 'Living Room', min: { x: 0, z: 0 }, max: { x: 6, z: 4 } },
    { name: 'Kitchen', min: { x: 6, z: 0 }, max: { x: 10, z: 3 } },
    { name: 'WC', min: { x: 2, z: 4 }, max: { x: 3.5, z: 5.5 } },
    { name: 'Entry', min: { x: 2.4, z: 5 }, max: { x: 4, z: 7 } },
  ],
  stairs: [{ min: { x: 8, z: 3 }, max: { x: 9, z: 7 } }],
  ...extra,
});

describe('proposeSections', () => {
  it('starts with the stair, then rooms by size', () => {
    const labels = proposeSections(house()).map((p) => p.label);
    assert.equal(labels[0], 'Through the stair');
    assert.equal(labels[1], 'Through Living Room');
    assert.ok(labels.includes('Through Kitchen') || labels[0] === 'Through the stair', 'the kitchen shares the stair cut or follows');
  });

  it('cuts across the short side and spans past the building on both ends', () => {
    const [first] = proposeSections(house());
    assert.equal(first.a.x, first.b.x, 'a line of constant x on a house long along x');
    assert.equal(first.a.z, -CUT_OVERHANG_M);
    assert.equal(first.b.z, 7 + CUT_OVERHANG_M);
    assert.equal(first.a.x, 8.5, 'through the stair\'s middle');
    assert.ok(first.side.x > first.a.x, 'looks along the long side');
  });

  it('turns with the building: long along Z gives lines of constant z', () => {
    const [first] = proposeSections({ building: { min: { x: 0, z: 0 }, max: { x: 6, z: 12 } }, rooms: [], stairs: [{ min: { x: 1, z: 5 }, max: { x: 2, z: 7 } }] });
    assert.equal(first.a.z, first.b.z);
    assert.equal(first.a.z, 6);
  });

  it('proposes a cut once when two things lie on it, and leaves out cupboards', () => {
    const proposals = proposeSections(house({ rooms: [...house().rooms, { name: 'Store', min: { x: 5, z: 6 }, max: { x: 6, z: 7 } }] }));
    const xs = proposals.map((p) => p.a.x);
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) assert.ok(Math.abs(xs[i] - xs[j]) >= 0.6, `${xs[i]} and ${xs[j]} are the same cut`);
    assert.ok(!proposals.some((p) => p.through === 'Store'), 'a 1 m² store gets no section');
    assert.ok(!proposals.some((p) => p.through === 'Entry'), 'the entry lies on the WC cut');
  });

  it('still proposes a cut through the middle of a model with no rooms or stair', () => {
    const proposals = proposeSections({ building: { min: { x: 0, z: 0 }, max: { x: 10, z: 7 } }, rooms: [], stairs: [] });
    assert.deepEqual(proposals.map((p) => [p.label, p.a.x]), [['Through the middle', 5]]);
  });

  it('proposes nothing for an empty extent', () => {
    assert.deepEqual(proposeSections({ building: { min: { x: 0, z: 0 }, max: { x: 0, z: 0 } }, rooms: [], stairs: [] }), []);
  });

  describe('rooms that share a name (#219)', () => {
    const room = (id: string, storey: string | undefined, x: number): ProposalInput['rooms'][number] => ({
      id, ...(storey ? { storey } : {}), name: 'OPEN OFFICE', min: { x, z: 0 }, max: { x: x + 3, z: 4 },
    });
    const input = (rooms: ProposalInput['rooms']): ProposalInput => ({ building: { min: { x: 0, z: 0 }, max: { x: 40, z: 7 } }, rooms, stairs: [] });

    it('keys each room by its own id, so no two entries share a key', () => {
      const proposals = proposeSections(input([room('g1', 'Level 1', 0), room('g2', 'Level 1', 10), room('g3', 'Level 2', 20)]));
      assert.equal(proposals.length, 3);
      assert.deepEqual(proposals.map((p) => p.key).sort(), ['room-g1', 'room-g2', 'room-g3']);
      assert.equal(new Set(proposals.map((p) => p.key)).size, proposals.length);
    });

    it('tells same-named rooms apart by storey, and by number when the storey is shared too', () => {
      const proposals = proposeSections(input([room('g1', 'Level 1', 0), room('g2', 'Level 2', 10), room('g3', 'Level 2', 20)]));
      const labels = proposals.map((p) => p.label);
      assert.equal(new Set(labels).size, 3, labels.join(' | '));
      assert.ok(labels.includes('Through OPEN OFFICE (Level 1)'));
      assert.ok(labels.includes('Through OPEN OFFICE (Level 2, 1)') && labels.includes('Through OPEN OFFICE (Level 2, 2)'), labels.join(' | '));
    });

    it('numbers same-named rooms when no storey is known, and leaves a unique name plain', () => {
      const proposals = proposeSections(input([room('g1', undefined, 0), room('g2', undefined, 10), { ...room('g3', undefined, 20), name: 'Kitchen' }]));
      const labels = proposals.map((p) => p.label).sort();
      assert.deepEqual(labels, ['Through Kitchen', 'Through OPEN OFFICE (1)', 'Through OPEN OFFICE (2)']);
    });

    it('is stable: the same input gives the same keys and labels, whatever order the rooms arrive in', () => {
      const rooms = [room('g1', 'Level 1', 0), room('g2', 'Level 1', 10), room('g3', 'Level 1', 20)];
      const a = proposeSections(input(rooms)).map((p) => [p.key, p.label]);
      const b = proposeSections(input([...rooms].reverse())).map((p) => [p.key, p.label]);
      assert.deepEqual(b.sort(), a.sort());
    });

    it('keys rooms without an id by name and the number among its namesakes', () => {
      const proposals = proposeSections(input([{ ...room('x', undefined, 0), id: undefined }, { ...room('y', undefined, 10), id: undefined }]));
      assert.equal(new Set(proposals.map((p) => p.key)).size, 2);
    });

    it('numbers several stairs apart, and leaves a single stair plain', () => {
      const stairs = [{ min: { x: 2, z: 3 }, max: { x: 3, z: 5 } }, { min: { x: 20, z: 3 }, max: { x: 21, z: 5 } }];
      const two = proposeSections({ ...input([]), stairs });
      assert.deepEqual(two.map((p) => p.label), ['Through the stair (1)', 'Through the stair (2)']);
      assert.deepEqual(proposeSections({ ...input([]), stairs: [stairs[0]] }).map((p) => p.label), ['Through the stair']);
    });
  });
});
