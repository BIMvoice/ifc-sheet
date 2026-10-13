/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The extents a draft set is sized to. A model's whole box is wrong for
 * this when a stray element sits far from the building (a survey marker, a
 * site object): the sections would cut through empty ground and the plans
 * would shrink to fit the outlier. The main body is the box of the elements
 * that chain together from the largest element, each within `gap` metres of
 * the box so far; the rest are reported as left out.
 */

/** A box in the viewer frame, metres. */
export interface Box3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** Elements farther than this from the building (and from each other), metres, are not part of it. */
export const MAIN_BODY_GAP_M = 10;

const volume = (b: Box3): number => (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
const near = (a: Box3, b: Box3, gap: number): boolean =>
  a.min.x - gap <= b.max.x && b.min.x - gap <= a.max.x
  && a.min.y - gap <= b.max.y && b.min.y - gap <= a.max.y
  && a.min.z - gap <= b.max.z && b.min.z - gap <= a.max.z;
const union = (a: Box3, b: Box3): Box3 => ({
  min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
  max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
});

/** The box of the main body of `boxes` and how many boxes were left out; `null` when there are none. */
export function mainBodyBounds(boxes: readonly Box3[], gap: number = MAIN_BODY_GAP_M): { bounds: Box3; leftOut: number } | null {
  if (boxes.length === 0) return null;
  let seed = 0;
  boxes.forEach((b, i) => { if (volume(b) > volume(boxes[seed])) seed = i; });
  let body = boxes[seed];
  const taken = new Array<boolean>(boxes.length).fill(false);
  taken[seed] = true;
  let count = 1;
  for (let grew = true; grew;) {
    grew = false;
    boxes.forEach((b, i) => {
      if (taken[i] || !near(body, b, gap)) return;
      taken[i] = true;
      body = union(body, b);
      count++;
      grew = true;
    });
  }
  return { bounds: body, leftOut: boxes.length - count };
}
