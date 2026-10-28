/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Editing a chain keeps the anchor of every end that still sits on its snapped point (#468), so the dimensions still follow the model. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { dimensionLayout } from './annotation.js';
import { anchorOf, anchorsOf, encodeAnchor } from './dimension-anchor.js';
import { addChainPoint, chainOf, removeChainPoint, splitChain } from './dimension-chain-edit.js';
import { newDraft } from './draft-store.js';
import type { DraftEntity, Pt } from './types.js';
import { compareStates } from '../whatchanged/compare.js';
import { followDimensions } from '../whatchanged/follow-dimensions.js';
import { snapshotFromElements, type SnapElement } from '../whatchanged/snapshot.js';
import { planBand } from '../whatchanged/visibility.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const band = { ...planBand('plan', 0, 1.2), plane };
const bandOf = (id: string) => (id === 'plan' ? band : undefined);
/** Two walls on the chain's line: A from x 0 to 4, B from 5 to 9; the plan draws a world box (x, y up, z) at (x, z). */
const wall = (g: string, x0: number, x1: number): SnapElement => ({ k: g, t: 'IfcWall', n: g, d: 'd', g: `${g}${x0}:${x1}`, a: [x0, 0, 0, x1, 2.5, 0.2] });
const A = { x0: 0, y0: 0, x1: 4, y1: 0.2 }, B = { x0: 5, y0: 0, x1: 9, y1: 0.2 };
const at = (p: Pt, rect: typeof A, guid: string): string => encodeAnchor(anchorOf(p, { guid, rect })!);
/** A moves its start 1 m back, B its end 1 m on. */
const changes = () => compareStates(snapshotFromElements([wall('A', 0, 4), wall('B', 5, 9)], 0), snapshotFromElements([wall('A', -1, 4), wall('B', 5, 10)], 0));

const dim = (a: number, b: number, params: Record<string, string>): DraftEntity =>
  newDraft('plan', '0', { type: 'dimension', variant: 'aligned', a: { x: a, y: 0 }, b: { x: b, y: 0 }, at: { x: (a + b) / 2, y: -0.6 }, height: 0.25 }, params);
/** 0-4-9, outer ends anchored to A's start and B's end. */
const chain = (): DraftEntity[] => [
  dim(0, 4, { anchorA: at({ x: 0, y: 0 }, A, 'A'), anchorB: at({ x: 4, y: 0 }, A, 'A') }),
  dim(4, 9, { anchorA: at({ x: 4, y: 0 }, A, 'A'), anchorB: at({ x: 9, y: 0 }, B, 'B') }),
];
const label = (d: DraftEntity) => (d.shape.type === 'dimension' ? dimensionLayout(d.shape).label : '');
const ends = (d: DraftEntity) => (d.shape.type === 'dimension' ? [d.shape.a.x, d.shape.b.x] : []);
const params = (d: DraftEntity) => anchorsOf(d).map((x) => x.param);
const followed = (drafts: readonly DraftEntity[]) => followDimensions(drafts, changes(), bandOf);

describe('chain edits keep anchors', () => {
  it('removing the middle point keeps both outer anchors, and the joined dimension re-measures', () => {
    const base = chain();
    const out = removeChainPoint(base, base[0].id, { x: 4, y: 0 }, 0.05)!;
    assert.equal(out.length, 1);
    assert.deepEqual(params(out[0]), ['anchorA', 'anchorB']);
    assert.equal(label(out[0]), '9.00');
    const [now] = followed(out);
    assert.deepEqual(ends(now), [-1, 10]);
    assert.equal(label(now), '11.00');
  });

  it('adding a point inside a dimension keeps each outer end anchored and gives the new point none', () => {
    const base = chain();
    const out = addChainPoint(base, base[0].id, { x: 6, y: 0 })!;
    const [d1, d2, d3] = chainOf(out, base[0].id);
    assert.deepEqual([params(d2), params(d3)], [['anchorA'], ['anchorB']]);
    assert.deepEqual(params(d1), ['anchorA', 'anchorB']);
    const [n1, n2, n3] = followed([d1, d2, d3]);
    assert.deepEqual([ends(n1), ends(n2), ends(n3)], [[-1, 4], [4, 6], [6, 10]]);
  });

  it('adding a point beyond the end carries the old end anchor to the new dimension, which then follows', () => {
    const base = chain();
    const out = addChainPoint(base, base[0].id, { x: 12, y: 0 })!;
    const added = out.at(-1) as DraftEntity;
    assert.deepEqual(params(added), ['anchorA']);
    assert.deepEqual(ends(followed(out).at(-1) as DraftEntity), [10, 12]);
  });

  it('adding a point before the start carries the old start anchor to the new dimension', () => {
    const base = chain();
    const out = addChainPoint(base, base[0].id, { x: -3, y: 0 })!;
    const added = chainOf(out, base[0].id)[0];
    assert.deepEqual(params(added), ['anchorB']);
    assert.deepEqual(ends(followed(out).find((d) => d.id === added.id) as DraftEntity), [-3, -1]);
  });

  it('splitting keeps every anchor', () => {
    const base = chain();
    const out = splitChain(base, base[0].id, { x: 4, y: 0 }, 0.05)!;
    assert.deepEqual(out.map(params), [['anchorA', 'anchorB'], ['anchorA', 'anchorB']]);
    assert.deepEqual(followed(out).map(ends), [[-1, 4], [4, 10]]);
  });
});
