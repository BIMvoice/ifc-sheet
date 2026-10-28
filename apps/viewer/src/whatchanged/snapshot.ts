/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model as the project last knew it, small enough to be saved with the
 * project. It is the engine's own `EntityFingerprint` reduced to what WHATCHANGED
 * needs, and held as ONE compact text (`rows`) so that it stays one line in the
 * project file (which is pretty-printed: an array of numbers would take a line
 * each), in the autosave and in a package:
 *
 *   per element  GlobalId, class, name (48 characters at most), a 40-bit hash of
 *                everything the element is (`d`), a 40-bit hash of its geometry
 *                (`g`), its box in whole millimetres and its spatial container;
 *   and, only where the element has them, 24-bit hashes of its own attributes
 *   and of its type assignment, so a change can say "attributes" or "type".
 *
 * What it does NOT keep is a hash per property set: a change in a property set
 * reads "properties changed", not which set. Classes and containers are listed
 * once. About 130 bytes an element (6.5 MB for 50 000 elements); the first version
 * kept every property set's hash, about 300 bytes an element. Both snapshots of
 * a comparison pass through the same truncation, so equal means equal. Pure.
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
  /** Hash of the attributes (`attr:core`) and of the type assignment (`type-assignment`), where the element has them. */
  c?: Record<string, string>;
  /** Geometry fingerprint. */
  g?: string;
  /** World box, metres: min x, y, z, max x, y, z (absolute, not shifted for rendering). */
  a?: number[];
  /** Spatial container as a name path. */
  p?: string;
}

export interface SnapshotBody {
  takenAt: number;
  /** How many elements `rows` holds. */
  count: number;
  /** The elements, compact JSON (`encodeRows`). */
  rows: string;
}

/**
 * The project's model state: the reference a new version is compared with, and, riding with it so that it is
 * saved, autosaved and recovered wherever the reference is, the model as the LAST issue went out (#335).
 */
export interface ModelSnapshot extends SnapshotBody {
  issued?: {
    /** The issue (`ProjectIssue.id`) this is the model of. */
    issueId: string;
    /** The model as issued; absent when it is the reference itself, which is then not kept twice. */
    state?: SnapshotBody;
  };
}

/**
 * `next` as the reference. The model as issued goes on riding with it, and is kept in full when it was the old
 * reference itself: replacing the reference must not lose what the last issue was compared against.
 */
export function replaceReference(old: ModelSnapshot | undefined, next: ModelSnapshot): ModelSnapshot {
  if (!old?.issued) return next;
  const { issued, ...body } = old;
  return { ...next, issued: issued.state ? issued : { issueId: issued.issueId, state: body } };
}

const KEPT_COMPONENTS = ['attr:core', 'type-assignment'] as const;
const NAME_MAX = 48;
const HASH_HEX = 10;
const COMPONENT_HEX = 6;
const mm = (v: number) => Math.round(v * 1000);

/** The first `n` characters of a hash, as text. */
const cut = (h: string | bigint | number, n: number): string => String(h).slice(0, n);
const geometryCut = (g: string | bigint): string => (typeof g === 'bigint' ? g.toString(36) : String(g)).slice(0, 9);

type Row = [string, number, string, string, number, string, number[], string];

/** The elements as the compact text `rows`. */
export function encodeRows(elements: readonly SnapElement[]): string {
  const classes: string[] = [], classAt = new Map<string, number>();
  const paths: string[] = [], pathAt = new Map<string, number>();
  const at = (list: string[], map: Map<string, number>, v: string): number => { let i = map.get(v); if (i === undefined) { i = list.length; list.push(v); map.set(v, i); } return i; };
  const rows = elements.map((e): Row => [
    e.k, at(classes, classAt, e.t), e.d, e.g ?? '', e.p === undefined ? -1 : at(paths, pathAt, e.p), e.n ?? '', e.a && e.a.length === 6 ? e.a.map(mm) : [],
    KEPT_COMPONENTS.map((c) => e.c?.[c] ?? '').join('.'),
  ]);
  return JSON.stringify({ classes, paths, rows });
}

/** The elements of `rows`; throws where it is not what `encodeRows` writes. */
export function decodeRows(text: string): SnapElement[] {
  const data = JSON.parse(text) as { classes: string[]; paths: string[]; rows: Row[] };
  return data.rows.map((r): SnapElement => {
    const [attr, type] = r[7].split('.');
    return {
      k: r[0], t: data.classes[r[1]], d: r[2],
      ...(r[5] ? { n: r[5] } : {}), ...(r[3] ? { g: r[3] } : {}),
      ...(r[6].length === 6 ? { a: r[6].map((v) => v / 1000) } : {}),
      ...(r[4] >= 0 ? { p: data.paths[r[4]] } : {}),
      ...(attr || type ? { c: { ...(attr ? { 'attr:core': attr } : {}), ...(type ? { 'type-assignment': type } : {}) } } : {}),
    };
  });
}

const decoded = new WeakMap<SnapshotBody, SnapElement[]>();

/** The elements of a snapshot (decoded once). */
export function snapshotElements(snapshot: SnapshotBody): SnapElement[] {
  let list = decoded.get(snapshot);
  if (!list) { list = decodeRows(snapshot.rows); decoded.set(snapshot, list); }
  return list;
}

/** A snapshot of `elements` as they are given (tests and migrations; `snapshotOf` truncates fingerprints). */
export function snapshotFromElements(elements: readonly SnapElement[], takenAt: number): ModelSnapshot {
  const sorted = [...elements].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return { takenAt, count: sorted.length, rows: encodeRows(sorted) };
}

/** The snapshot of fingerprints; `nameOf` gives an element's name. Elements with no GlobalId are left out (they cannot be followed across versions). */
export function snapshotOf(fingerprints: readonly EntityFingerprint<unknown>[], nameOf: (key: string) => string, takenAt: number): ModelSnapshot {
  const elements = fingerprints.filter((f) => !f.key.startsWith('missing:')).map((f): SnapElement => {
    const name = nameOf(f.key).slice(0, NAME_MAX);
    const kept = KEPT_COMPONENTS.flatMap((c) => (f.components?.[c] !== undefined ? [[c, cut(f.components[c], COMPONENT_HEX)] as const] : []));
    return {
      k: f.key, t: f.ifcType, ...(name ? { n: name } : {}), d: cut(f.dataHash, HASH_HEX),
      ...(kept.length ? { c: Object.fromEntries(kept) } : {}),
      ...(f.geometryHash !== undefined ? { g: geometryCut(f.geometryHash as string | bigint) } : {}),
      ...(f.aabb ? { a: [...f.aabb.min, ...f.aabb.max].map((v) => mm(v) / 1000) } : {}),
      ...(f.container !== undefined ? { p: f.container } : {}),
    };
  });
  return snapshotFromElements(elements, takenAt);
}

export function fingerprintsOf(snapshot: SnapshotBody): EntityFingerprint<null>[] {
  return snapshotElements(snapshot).map((e): EntityFingerprint<null> => ({
    key: e.k, ifcType: e.t, dataHash: e.d,
    ...(e.c ? { components: e.c } : {}),
    ...(e.g !== undefined ? { geometryHash: e.g } : {}),
    ...(e.a && e.a.length === 6 ? { aabb: { min: [e.a[0], e.a[1], e.a[2]] as const, max: [e.a[3], e.a[4], e.a[5]] as const } } : {}),
    ...(e.p !== undefined ? { container: e.p } : {}),
    ref: null,
  }));
}
