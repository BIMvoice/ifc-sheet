/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the spec a roof system keeps in its property set: for one roof
 * (`readRoof` in `roof-system-store.ts`), or for many roofs in one pass over
 * the model's IfcRelDefinesByProperties. A floor plan asks for every roof on
 * its storey, and asking one roof at a time read every property relationship
 * once per roof (#154).
 */

import type { MutablePropertyView } from '@ifc-lite/mutations';
import type { IfcDataStore } from '@ifc-lite/parser';
import { AnchorEntityReader } from './resolve-anchor.js';
import type { RoofSystemSpec } from './roof-system-store.js';

export const ROOF_SYSTEM_PSET = 'Pset_IfcLiteRoofSystem';

export const refId = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  return typeof v === 'string' && /^#\d+$/.test(v) ? Number(v.slice(1)) : null;
};

/** A roof system's spec and the property holding it; null when that property does not parse. */
export type RoofSpecRead = { spec: RoofSystemSpec; propertyId: number } | null;

/**
 * What property set `setId` says about the roofs it is attached to: undefined
 * when it is not a roof system's set or holds no Spec, else its last Spec
 * property (null when that does not parse).
 */
export function roofSpecOfSet(reader: AnchorEntityReader, setId: number | null): RoofSpecRead | undefined {
  const set = reader.entity(setId ?? -1);
  if (!set || set.attributes[2] !== ROOF_SYSTEM_PSET) return undefined;
  let found: RoofSpecRead | undefined;
  for (const p of Array.isArray(set.attributes[4]) ? set.attributes[4] : []) {
    const prop = reader.entity(refId(p) ?? -1);
    if (prop?.attributes[0] !== 'Spec') continue;
    const v = prop.attributes[2] as unknown;
    const raw = Array.isArray(v) ? v[1] : v && typeof v === 'object' && 'typed' in v ? (v as { typed: { value: unknown } }).typed.value : v;
    try { found = { spec: JSON.parse(String(raw)) as RoofSystemSpec, propertyId: refId(p)! }; } catch { found = null; }
  }
  return found;
}

/**
 * `readRoofSystem` for each of `roofIds` at once: the spec of every one that
 * is a roof system, read in one pass over the property relationships. Where a
 * roof has more than one Spec, the last read wins, as in `readRoofSystem`.
 */
export function readRoofSystems(
  store: IfcDataStore,
  roofIds: Iterable<number>,
  view?: MutablePropertyView | null,
): Map<number, RoofSystemSpec> {
  const wanted = new Set(roofIds);
  const found = new Map<number, RoofSpecRead>();
  if (wanted.size === 0) return new Map();
  const reader = new AnchorEntityReader(store, view);
  for (const relId of reader.ids('IFCRELDEFINESBYPROPERTIES')) {
    // Most of a model's property relationships name no roof: skip them before parsing them (#154).
    if (!reader.mayReferTo(relId, wanted)) continue;
    const rel = reader.entity(relId);
    const related = rel && Array.isArray(rel.attributes[4]) ? rel.attributes[4] : null;
    const roofs = related?.map(refId).filter((id): id is number => id !== null && wanted.has(id)) ?? [];
    if (roofs.length === 0) continue;
    const read = roofSpecOfSet(reader, refId(rel!.attributes[5]));
    if (read === undefined) continue;
    for (const roof of roofs) found.set(roof, read);
  }
  const specs = new Map<number, RoofSystemSpec>();
  for (const [roof, read] of found) if (read) specs.set(roof, read.spec);
  return specs;
}
