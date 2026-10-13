/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model as the project last knew it, small enough to be saved with the
 * project: per element its GlobalId, class, name, the hashes of its data (and of
 * each property set), its geometry fingerprint and its world box. It is the
 * engine's own `EntityFingerprint` in a JSON-safe shape (`@ifc-lite/diff` does
 * the comparing); nothing here compares. Pure.
 */

import type { EntityFingerprint } from '@ifc-lite/diff';

export interface SnapElement {
  /** GlobalId. */
  k: string;
  /** IFC class. */
  t: string;
  /** Name, for the list. */
  n?: string;
  /** Hash of attributes, property sets, quantities and type. */
  d: string;
  /** Hash of each component: `attr:core`, `pset:<Name>`, `qset:<Name>`, `type-assignment`. */
  c?: Record<string, string>;
  /** Geometry fingerprint. */
  g?: string;
  /** World box, metres: min x, y, z, max x, y, z. */
  a?: number[];
  /** Spatial container as a name path. */
  p?: string;
}

export interface ModelSnapshot {
  takenAt: number;
  elements: SnapElement[];
}

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** The snapshot of fingerprints; `nameOf` gives an element's name. Elements with no GlobalId are left out (they cannot be followed across versions). */
export function snapshotOf(fingerprints: readonly EntityFingerprint<unknown>[], nameOf: (key: string) => string, takenAt: number): ModelSnapshot {
  const elements = fingerprints.filter((f) => !f.key.startsWith('missing:')).map((f): SnapElement => ({
    k: f.key, t: f.ifcType, ...(nameOf(f.key) ? { n: nameOf(f.key) } : {}), d: f.dataHash,
    ...(f.components ? { c: { ...f.components } } : {}),
    ...(f.geometryHash !== undefined ? { g: String(f.geometryHash) } : {}),
    ...(f.aabb ? { a: [...f.aabb.min, ...f.aabb.max].map(mm) } : {}),
    ...(f.container !== undefined ? { p: f.container } : {}),
  }));
  return { takenAt, elements: elements.sort((a, b) => a.k.localeCompare(b.k)) };
}

export function fingerprintsOf(snapshot: ModelSnapshot): EntityFingerprint<null>[] {
  return snapshot.elements.map((e): EntityFingerprint<null> => ({
    key: e.k, ifcType: e.t, dataHash: e.d,
    ...(e.c ? { components: e.c } : {}),
    ...(e.g !== undefined ? { geometryHash: e.g } : {}),
    ...(e.a && e.a.length === 6 ? { aabb: { min: [e.a[0], e.a[1], e.a[2]] as const, max: [e.a[3], e.a[4], e.a[5]] as const } } : {}),
    ...(e.p !== undefined ? { container: e.p } : {}),
    ref: null,
  }));
}
