/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What changed between two states of a model, by GlobalId: added, removed,
 * moved, reshaped, a property or a property set changed, the type changed. The
 * matching and the classification of data, geometry and container differences
 * are `@ifc-lite/diff`'s (`diffModels`); this reads its entries into the words a
 * drawing set needs and decides, from the boxes, a move from a reshape. Pure
 * and deterministic: changes come out sorted by GlobalId.
 */

import { diffModels } from '@ifc-lite/diff';
import { fingerprintsOf, snapshotElements, type ModelSnapshot } from './snapshot';

export const CHANGE_KINDS = ['added', 'removed', 'moved', 'reshaped', 'property', 'type'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** A world box: min x, y, z, max x, y, z, metres. */
export type Box = readonly number[];

export interface ModelChange {
  guid: string;
  className: string;
  name: string;
  /** Every way the element changed. */
  kinds: ChangeKind[];
  /** The property sets (and quantity sets) that changed; `attributes` for the element's own. */
  sets: string[];
  /** Where it was and where it is (absent: it had no box, or was not there). */
  before?: Box;
  after?: Box;
}

/** A shift or a change of size smaller than this is no change of place, metres. */
export const DEFAULT_TOLERANCE_M = 0.01;

const corner = (b: Box, far: boolean): number[] => [0, 1, 2].map((i) => b[i + (far ? 3 : 0)]);
const size = (b: Box): number[] => [0, 1, 2].map((i) => b[i + 3] - b[i]);
const worst = (a: readonly number[], b: readonly number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** What a differing geometry fingerprint means, from the boxes: moved, reshaped, or both. */
function geometryKinds(before: Box | undefined, after: Box | undefined, tolerance: number): ChangeKind[] {
  if (!before || !after) return ['reshaped'];
  const resized = worst(size(before), size(after)) > tolerance;
  // Moved is both corners shifting: an element lengthened at one end keeps a corner where it was.
  const shifted = Math.min(worst(corner(before, false), corner(after, false)), worst(corner(before, true), corner(after, true))) > tolerance;
  return [...(shifted ? ['moved' as const] : []), ...(resized || !shifted ? ['reshaped' as const] : [])];
}

const setName = (component: string): string => (component === 'attr:core' ? 'attributes' : component.replace(/^(pset|qset):/, ''));

export function compareStates(base: ModelSnapshot, head: ModelSnapshot, tolerance = DEFAULT_TOLERANCE_M): ModelChange[] {
  const names = new Map([...snapshotElements(base), ...snapshotElements(head)].map((e) => [e.k, e.n ?? ''] as const));
  const diff = diffModels(fingerprintsOf(base), fingerprintsOf(head), { scope: 'both' });
  const out: ModelChange[] = [];
  for (const e of diff.entries) {
    if (e.state === 'unchanged') continue;
    const before = e.base?.aabb ? [...e.base.aabb.min, ...e.base.aabb.max] : undefined;
    const after = e.head?.aabb ? [...e.head.aabb.min, ...e.head.aabb.max] : undefined;
    const className = (e.head ?? e.base)!.ifcType;
    const common = { guid: e.key, className, name: names.get(e.key) ?? '' };
    if (e.state === 'added') { out.push({ ...common, kinds: ['added'], sets: [], ...(after ? { after } : {}) }); continue; }
    if (e.state === 'deleted') { out.push({ ...common, kinds: ['removed'], sets: [], ...(before ? { before } : {}) }); continue; }
    const kinds = new Set<ChangeKind>();
    const sets: string[] = [];
    const components = e.changedComponents ?? [];
    for (const c of components) {
      if (c === 'type-assignment') kinds.add('type');
      else { kinds.add('property'); sets.push(setName(c)); }
    }
    // The data differs and neither its attributes nor its type say so: a property set did (a saved state keeps no hash per set, so which one is not known).
    if (e.changeKinds.includes('data') && components.length === 0) kinds.add('property');
    if (e.changeKinds.includes('container')) kinds.add('moved');
    if (e.changeKinds.includes('geometry')) for (const k of geometryKinds(before, after, tolerance)) kinds.add(k);
    if (kinds.size === 0) continue;
    out.push({ ...common, kinds: CHANGE_KINDS.filter((k) => kinds.has(k)), sets: [...new Set(sets)].sort(), ...(before ? { before } : {}), ...(after ? { after } : {}) });
  }
  return out.sort((a, b) => (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0));
}
