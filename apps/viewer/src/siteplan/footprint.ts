/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The building's footprint on a site plan, from the site plan's own drawing:
 * the ground storey cut, through the existing drawing generation. The cut
 * faces of what encloses the building (walls, columns, curtain walls, and the
 * doors and windows that close the gaps between them) are united, and the
 * outer rings of the union are the footprint — every hole (the rooms) filled.
 * Cut faces that only touch are not exactly touching in f32 drawing
 * coordinates, so each is grown by `CLOSE` before the union and the outer
 * rings shrunk back by as much after it: a gap under twice that closes, and
 * the area is the outline's as drawn.
 *
 * Limits, stated: a courtyard or light well is filled too, and a balcony or
 * overhang above the cut is not drawn. The urban indicators' footprint
 * (meshes of the storey, holes told apart by floor) is the permit's measure
 * and gives the site balance its built area; this one only places the setbacks.
 */

import type { DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { Pt } from '@/drafting/types';
import { doubleSignedArea, insideRing, ringArea } from './plot';

/** Unites rings into disjoint rings (outer and hole rings, any orientation). */
export type RingUnion = (rings: Pt[][]) => Pt[][];

const ENCLOSURE = /^IFC(WALL|WALLSTANDARDCASE|WALLELEMENTEDCASE|COLUMN|COLUMNSTANDARDCASE|CURTAINWALL|DOOR|DOORSTANDARDCASE|WINDOW|WINDOWSTANDARDCASE|PLATE|MEMBER)$/i;

/** The rings of the drawing's cut faces that enclose the building. */
export function enclosureRings(polygons: readonly DrawingPolygon[]): Pt[][] {
  const out: Pt[][] = [];
  for (const p of polygons) {
    if (!p.isCut || !ENCLOSURE.test(p.ifcType)) continue;
    if (p.polygon.outer.length >= 3) out.push(p.polygon.outer.map((q) => ({ x: q.x, y: q.y })));
  }
  return out;
}

/** Metres each cut face grows by before the union (and the result shrinks by after it). */
export const CLOSE = 0.005;

/**
 * `ring` moved outward by `d` metres (inward for a negative `d`), corner by
 * corner on the bisector of its two edges' normals (a mitre, as an offset of
 * straight edges is), whichever way the ring turns.
 */
export function offsetRing(ring: readonly Pt[], d: number): Pt[] {
  const turn = Math.sign(doubleSignedArea(ring)) || 1;
  const normal = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Right of the direction of travel is outside a counter-clockwise ring.
    return { x: (turn * (b.y - a.y)) / len, y: (turn * -(b.x - a.x)) / len };
  };
  return ring.map((p, i) => {
    const n1 = normal(ring[(i - 1 + ring.length) % ring.length], p);
    const n2 = normal(p, ring[(i + 1) % ring.length]);
    // The mitre: d·(n1 + n2) / (1 + n1·n2), limited where the edges fold back on each other.
    const k = d / Math.max(1 + n1.x * n2.x + n1.y * n2.y, 0.25);
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k };
  });
}

/** The outer rings of a union: those inside no other ring. */
export function outerRings(rings: readonly Pt[][]): Pt[][] {
  return rings.filter((r, i) => !rings.some((o, j) => j !== i && ringArea(o) > ringArea(r) && insideRing(r[0], o)));
}

/** The footprint rings of a site plan drawing's cut. */
export function footprintRings(polygons: readonly DrawingPolygon[], union: RingUnion): Pt[][] {
  const rings = enclosureRings(polygons).map((r) => offsetRing(r, CLOSE));
  return rings.length ? outerRings(union(rings)).map((r) => offsetRing(r, -CLOSE)) : [];
}
