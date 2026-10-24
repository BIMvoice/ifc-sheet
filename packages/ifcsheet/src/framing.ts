/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The box a drawing set is framed on (#268): the building, without the small
 * stray elements that real files carry far from it (a survey point, an origin
 * or geo-reference cube, usually an IfcBuildingElementProxy). One of them is
 * enough to stretch a plan, an elevation and a section over an empty field,
 * so the set is laid out at 1:200 and every sheet reads "does not fit".
 *
 * The engine (`model.ts`) and the app (`project/model-rooms.ts`) both frame
 * through {@link frameElements}, so the command line and the app cannot
 * disagree about what the building is. Framing only: a far element stays in
 * the model, in the schedules and in the quantities, and is drawn wherever it
 * falls inside the frame; it just does not make the frame larger.
 *
 * The rule is relative to the building, never a distance in metres. First the
 * building's own box is estimated robustly: the elements' boxes with the
 * outermost 2.5 % of the element-size weight cut off at each end of each axis
 * (so a handful of strays cannot pull it, and a big slab counts for more than
 * a bolt). Its longest side is the building's span, S. An element is then
 * left out of the frame only when ALL of these hold:
 *
 *  1. it is small: its longest side is at most 0.1 S;
 *  2. it is far: the gap between its box and that estimate is more than 1 S;
 *  3. whatever small, far elements lie against it (within 0.1 S of each
 *     other) are together still small: at most 0.1 S across.
 *
 * Condition 3 keeps a far site made of many small parts (a fence of posts, a
 * detached shed built of a hundred pieces): joined up they are not a marker.
 * A big element is never left out however far (a long site wall, a mast),
 * nor a small one near the building (a detached garage at a modest distance),
 * nor one wing of a building in two parts (it is big and it is not far
 * compared with the span). A model with only a handful of elements is
 * framed whole: with so few the strays cannot be told from the building.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { createEntityBoundsLookup, type BoundingBox3D } from './entity-bounds.js';

/** The three numbers of the rule, as fractions of the building's span S. */
export const FRAMING_RULE = {
  /** Share of the element-size weight cut off at each end of each axis when estimating the building's box. */
  trim: 0.025,
  /** A framing outlier is at most this long (its longest side), and so is a group of them (condition 1 and 3). */
  small: 0.1,
  /** A framing outlier lies more than this beyond the building's box (condition 2). */
  far: 1,
} as const;

/** One element to frame: a key of the caller's (an express id) and its box. */
export interface FramedElement {
  key: number;
  box: BoundingBox3D;
}

/** An element the frame leaves out and how far it lies from the building (the frame without it), metres. */
export interface FarElement {
  key: number;
  box: BoundingBox3D;
  distance: number;
}

export interface Framing {
  /** The box the set is framed on; `null` for no elements. */
  extent: BoundingBox3D | null;
  /** The elements left out of it, farthest first; empty when `includeFar` is set. */
  farElements: FarElement[];
}

export interface FramingOptions {
  /** The project setting "include far-away elements in framing": frame on everything, as before #268. */
  includeFar?: boolean;
}

const AXES = ['x', 'y', 'z'] as const;
const size = (b: BoundingBox3D): number => Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
const diagonal = (b: BoundingBox3D): number => Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);

/** The distance between two boxes, 0 where they touch or overlap. */
export function boxGap(a: BoundingBox3D, b: BoundingBox3D): number {
  let sum = 0;
  for (const k of AXES) {
    const d = Math.max(a.min[k] - b.max[k], b.min[k] - a.max[k], 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function unionOf(boxes: readonly BoundingBox3D[]): BoundingBox3D | null {
  if (boxes.length === 0) return null;
  const out: BoundingBox3D = { min: { ...boxes[0].min }, max: { ...boxes[0].max } };
  for (const b of boxes) {
    for (const k of AXES) {
      if (b.min[k] < out.min[k]) out.min[k] = b.min[k];
      if (b.max[k] > out.max[k]) out.max[k] = b.max[k];
    }
  }
  return out;
}

/**
 * The building's box, estimated: each axis's ends with the outermost `trim`
 * of the size weight cut off. Whole elements are cut, and only while the cut
 * stays within the share, so a lone element heavier than it is never cut.
 */
function robustBox(boxes: readonly BoundingBox3D[]): BoundingBox3D {
  const weights = boxes.map((b) => Math.max(diagonal(b), 1e-9));
  const allowed = weights.reduce((a, w) => a + w, 0) * FRAMING_RULE.trim;
  const order = boxes.map((_, i) => i);
  const out: BoundingBox3D = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  for (const k of AXES) {
    for (const end of ['min', 'max'] as const) {
      const sign = end === 'min' ? 1 : -1;
      order.sort((a, b) => sign * (boxes[a][end][k] - boxes[b][end][k]));
      let cut = 0;
      let at = 0;
      while (at < order.length - 1 && cut + weights[order[at]] <= allowed) cut += weights[order[at++]];
      out[end][k] = boxes[order[at]][end][k];
    }
  }
  return out;
}

/** Groups of candidate indices, each element joined to any other within `link` of it. */
function groupsOf(boxes: readonly BoundingBox3D[], candidates: readonly number[], link: number): number[][] {
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (boxGap(boxes[candidates[i]], boxes[candidates[j]]) <= link) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, number[]>();
  candidates.forEach((c, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), c]));
  return [...byRoot.values()];
}

/** Below this many elements the strays cannot be told from the building: frame on all of them. */
const MIN_ELEMENTS = 8;

/**
 * The frame of `elements` and the ones it leaves out (see the file header for
 * the rule). With `includeFar`, the frame of all of them and none left out,
 * which is exactly the union of the boxes the set was framed on before.
 */
export function frameElements(elements: readonly FramedElement[], options: FramingOptions = {}): Framing {
  const boxes = elements.map((e) => e.box);
  const whole = unionOf(boxes);
  if (options.includeFar || elements.length < MIN_ELEMENTS) return { extent: whole, farElements: [] };

  const core = robustBox(boxes);
  const span = size(core);
  if (!(span > 0)) return { extent: whole, farElements: [] };
  const small = span * FRAMING_RULE.small;
  const candidates = boxes.flatMap((b, i) => (size(b) <= small && boxGap(b, core) > span * FRAMING_RULE.far ? [i] : []));
  const out = new Set<number>();
  for (const group of groupsOf(boxes, candidates, small)) {
    const together = unionOf(group.map((i) => boxes[i]));
    if (together && size(together) <= small) for (const i of group) out.add(i);
  }
  if (out.size === 0) return { extent: whole, farElements: [] };

  const kept = unionOf(boxes.filter((_, i) => !out.has(i)));
  if (!kept) return { extent: whole, farElements: [] };
  const farElements = [...out].map((i) => ({ key: elements[i].key, box: elements[i].box, distance: boxGap(elements[i].box, kept) }));
  return { extent: kept, farElements: farElements.sort((a, b) => b.distance - a.distance) };
}

/**
 * {@link frameElements} over the elements `ids` of a flat mesh list (ids as the
 * meshes carry them): the one call the engine and the app both make.
 */
export function frameEntities(meshes: MeshData[] | null, ids: readonly number[], options: FramingOptions = {}): Framing {
  const boundsOf = createEntityBoundsLookup(meshes, ids.length);
  return frameElements(ids.flatMap((key) => { const box = boundsOf(key); return box ? [{ key, box }] : []; }), options);
}

/** What a far element is called in a message: its Name, else its class and GlobalId. */
export function farElementLabel(e: { name?: string | null; type?: string | null; globalId?: string | null }): string {
  const name = e.name?.trim();
  if (name) return name;
  return [e.type?.trim() || 'Element', e.globalId?.trim()].filter(Boolean).join(' ');
}
