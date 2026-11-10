/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #492: what the user drew on a joinery type's views: read tolerantly, kept with the type, and turned into strokes and text in the view's metres. */
import { describe, expect, it } from 'vitest';
import { defaultWindowSpec, type JoineryViewDraft } from '@ifc-lite/create';
import { readJoinerySpec } from './joinery-spec-read.js';
import { joineryViewDraftPrims, joineryViewDrafts, readJoineryViewDrafts, withViewDrafts } from './joinery-view-drafts.js';
import { withViewDetail } from './joinery-view-detail.js';

const spec = { ...defaultWindowSpec('W'), id: 'w1' };
const line: JoineryViewDraft = { id: 'a', shape: { type: 'line', a: { x: -0.6, y: 0 }, b: { x: 0, y: 1.5 } }, lineType: 'dashed', weight: 0.18 };

describe('kept with the type', () => {
  it('a view\'s drafts are written to the type and read back from the stored form', () => {
    const drawn = withViewDrafts(spec, 'front', [line]);
    expect(joineryViewDrafts(drawn, 'front')).toEqual([line]);
    expect(joineryViewDrafts(drawn, 'plan')).toEqual([]);
    expect(readJoinerySpec(JSON.parse(JSON.stringify(drawn)))?.view?.drafts).toEqual({ front: [line] });
  });

  it('keeps the detail choice, and no choice at all is no field', () => {
    const both = withViewDrafts(withViewDetail(spec, 'outline'), 'plan', [line]);
    expect(both.view).toEqual({ detail: 'outline', drafts: { plan: [line] } });
    expect(withViewDetail(both, 'all').view?.drafts).toEqual({ plan: [line] });
    expect(withViewDrafts(withViewDrafts(spec, 'front', [line]), 'front', []).view).toBeUndefined();
  });

  it('drops what cannot be drawn: a missing end point, a dimension, a bad radius, an entry with no id', () => {
    const read = readJoineryViewDrafts({
      front: [
        { id: 'x1', shape: { type: 'line', a: { x: 0, y: 0 } } },
        { id: 'x2', shape: { type: 'dimension', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } },
        { id: 'x3', shape: { type: 'circle', c: { x: 0, y: 0 }, r: -1 } },
        { shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } },
        { id: 'ok', shape: { type: 'text', p: { x: 0, y: 0 }, text: 'T', height: 0.05, rotation: 0 }, lineType: 'solid', weight: -1 },
      ],
      attic: [line],
    });
    expect(read).toEqual({ front: [{ id: 'ok', shape: { type: 'text', p: { x: 0, y: 0 }, text: 'T', height: 0.05, rotation: 0 } }] });
    expect(readJoineryViewDrafts('nope')).toBeUndefined();
  });
});

describe('strokes and text', () => {
  it('a dashed line is one dashed stroke at its pen weight; a continuous one is not dashed', () => {
    expect(joineryViewDraftPrims([line], 50)).toEqual([{ kind: 'path', pts: [{ x: -0.6, y: 0 }, { x: 0, y: 1.5 }], closed: false, weight: 0.18, dashed: true }]);
    const [solid] = joineryViewDraftPrims([{ id: 'b', shape: line.shape }], 50);
    expect(solid).toMatchObject({ dashed: false, weight: 0.25 });
  });

  it('an arc follows the counter-clockwise sweep from start to end; a circle closes', () => {
    const [arc] = joineryViewDraftPrims([{ id: 'c', shape: { type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: Math.PI / 2 } }], 50);
    if (arc.kind !== 'path') throw new Error('path');
    expect(arc.pts[0].x).toBeCloseTo(1); expect(arc.pts[0].y).toBeCloseTo(0);
    const last = arc.pts[arc.pts.length - 1];
    expect(last.x).toBeCloseTo(0); expect(last.y).toBeCloseTo(1);
    expect(arc.pts.every((p) => Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-9)).toBe(true);
    // An arc from 270 to 90 degrees sweeps through 0, not through 180.
    const [wrap] = joineryViewDraftPrims([{ id: 'd', shape: { type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 1.5 * Math.PI, end: Math.PI / 2 } }], 50);
    if (wrap.kind !== 'path') throw new Error('path');
    expect(wrap.pts.every((p) => p.x > -1e-9)).toBe(true);
    const [circle] = joineryViewDraftPrims([{ id: 'e', shape: { type: 'circle', c: { x: 1, y: 1 }, r: 0.1 } }], 50);
    expect(circle).toMatchObject({ kind: 'path', closed: true });
  });

  it('text keeps its place, height and rotation', () => {
    expect(joineryViewDraftPrims([{ id: 't', shape: { type: 'text', p: { x: 0.1, y: 0.2 }, text: 'RO', height: 0.05, rotation: 0.5 } }], 50))
      .toEqual([{ kind: 'text', at: { x: 0.1, y: 0.2 }, text: 'RO', height: 0.05, rotation: 0.5 }]);
  });

  it('a hatch is lines inside its loop only, 2 mm apart on the paper at any scale', () => {
    // 1 m x 0.1 m rectangle at 45 degrees, k = 50 mm per metre: 2 mm is 0.04 m.
    const hatch: JoineryViewDraft = { id: 'h', shape: { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.1 }, { x: 0, y: 0.1 }]], pattern: 'ANSI31', scale: 1, angle: 45 } };
    const lines = joineryViewDraftPrims([hatch], 50);
    expect(lines.length).toBeGreaterThan(15);
    for (const l of lines) {
      if (l.kind !== 'path') throw new Error('path');
      for (const p of l.pts) { expect(p.x).toBeGreaterThanOrEqual(-1e-9); expect(p.x).toBeLessThanOrEqual(1 + 1e-9); expect(p.y).toBeGreaterThanOrEqual(-1e-9); expect(p.y).toBeLessThanOrEqual(0.1 + 1e-9); }
      expect(Math.abs((l.pts[1].y - l.pts[0].y) - (l.pts[1].x - l.pts[0].x))).toBeLessThan(1e-9);
    }
    // At 1:20 (k = 50) and 1:100 (k = 10) the spacing on paper stays 2 mm, so five times fewer lines at 1:100.
    const coarse = joineryViewDraftPrims([hatch], 10).length;
    expect(coarse).toBeLessThan(lines.length / 3);
  });
});
