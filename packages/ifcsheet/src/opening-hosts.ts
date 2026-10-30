/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The host-wall rule of a plan (#586): a door or window whose host wall is cut by the plan is drawn on that plan, as its plan
 * symbol, even when the opening itself lies wholly above or below the cut (a high window whose sill is over the cut, a wall hatch
 * that stops under it). This is common practice (Revit does it). A door or window with no host, or whose host wall the cut
 * does not pass through, is drawn as it always was: only when the cut passes through the opening.
 *
 * The host is found through IfcRelFillsElement (the door or window fills an IfcOpeningElement) and IfcRelVoidsElement (the
 * opening voids a wall), or, for a door or window that is an aggregated part of an IfcCurtainWall (IfcRelAggregates), that curtain
 * wall. A host is an IfcWall class or an IfcCurtainWall, whose extent is its own meshes and its parts' (`curtainPartsOf`: a curtain
 * wall can be a container with no body). `openingHostsOf` reads that once per model; `hostedInCutWall` is the test `openingSymbols` takes. The
 * engine (`planOpeningSymbols`) and the app (`project/view-symbols.ts`) both build the test here, so they cannot disagree.
 * The rule applies only to a door or window of the plan's own storey (`storeyMembersOf`, the membership plans are framed and cut
 * by: `storeyElementIds`, aggregated parts included): a door of another storey whose host wall is cut by this plan too (a
 * double-height glass wall) is not drawn through it.
 * This is only the host-wall rule: the wider view range (overhead range, reference storey, beyond-cut line styles) is #490's.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { RelationshipType } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';
import { storeyElementIds } from './storey-elements.js';

const OPENING_TYPES = ['IFCDOOR', 'IFCDOORSTANDARDCASE', 'IFCWINDOW', 'IFCWINDOWSTANDARDCASE'];
/** A host: a wall, or a curtain wall (glass walls host doors in real models). */
const HOST = /^IFC(WALL|CURTAINWALL)/i;
const CURTAIN_WALL = 'IFCCURTAINWALL';

const hostsByStore = new WeakMap<object, Map<number, number>>();

/**
 * The wall each door and window of `store` is hosted in, by express id: door or window, to the IfcRelFillsElement opening, to the
 * IfcRelVoidsElement wall; or, for a door or window that is an aggregated part of an IfcCurtainWall (IfcRelAggregates, no opening),
 * that curtain wall. Both are a host in the same way.
 */
export function openingHostsOf(store: IfcDataStore): ReadonlyMap<number, number> {
  const held = hostsByStore.get(store);
  if (held) return held;
  const hosts = new Map<number, number>();
  const graph = store.relationships;
  if (graph && store.entityIndex?.byType) {
    for (const type of OPENING_TYPES) {
      for (const id of store.entityIndex.byType.get(type) ?? []) {
        for (const opening of graph.getRelated(id, RelationshipType.FillsElement, 'inverse')) {
          const wall = graph.getRelated(opening, RelationshipType.VoidsElement, 'inverse')[0];
          if (wall !== undefined) { hosts.set(id, wall); break; }
        }
        if (hosts.has(id)) continue;
        const curtain = graph.getRelated(id, RelationshipType.Aggregates, 'inverse').find((parent) => store.entities.getTypeName(parent)?.toUpperCase() === CURTAIN_WALL);
        if (curtain !== undefined) hosts.set(id, curtain);
      }
    }
  }
  hostsByStore.set(store, hosts);
  return hosts;
}

const partsByStore = new WeakMap<object, Map<number, readonly number[]>>();

/**
 * The aggregated parts of each IfcCurtainWall of `store` (doors and windows left out), by express id. A curtain wall that is only a
 * container has no mesh of its own: the cut test reads its extent off these parts.
 */
export function curtainPartsOf(store: IfcDataStore): ReadonlyMap<number, readonly number[]> {
  const held = partsByStore.get(store);
  if (held) return held;
  const parts = new Map<number, readonly number[]>();
  const graph = store.relationships;
  if (graph && store.entityIndex?.byType) {
    for (const wall of store.entityIndex.byType.get(CURTAIN_WALL) ?? []) {
      parts.set(wall, graph.getRelated(wall, RelationshipType.Aggregates, 'forward').filter((part) => !OPENING_TYPES.includes(store.entities.getTypeName(part)?.toUpperCase() ?? '')));
    }
  }
  partsByStore.set(store, parts);
  return parts;
}

const membersByStore = new WeakMap<object, Map<string, ReadonlySet<number>>>();

/** The express ids of the elements on the storeys with these GlobalIds (`storeyElementIds`: contained elements and aggregated parts), read once per model and storey set. */
export function storeyMembersOf(store: IfcDataStore, storeyGlobalIds: readonly string[]): ReadonlySet<number> {
  const key = [...storeyGlobalIds].sort().join('|');
  let byKey = membersByStore.get(store);
  if (!byKey) membersByStore.set(store, (byKey = new Map()));
  const held = byKey.get(key);
  if (held) return held;
  const hierarchy = store.spatialHierarchy;
  const wanted = new Set(storeyGlobalIds);
  const storeys = hierarchy ? new Set([...hierarchy.byStorey.keys(), ...hierarchy.elementToStorey.values()]) : new Set<number>();
  const found = [...storeys].filter((id) => wanted.has(store.entities.getGlobalId(id) ?? ''));
  const members = new Set(hierarchy ? storeyElementIds(hierarchy, found, (id) => store.entities.getTypeEnum(id)) : []);
  byKey.set(key, members);
  return members;
}

/**
 * Whether element `id` is hosted in a wall the plan at height `cut` passes through: `hostOf` names the host's mesh id, and the host's
 * meshes (any IfcWall or IfcCurtainWall class among `meshes`, plus the meshes of the ids `partsOf` names for it: a curtain wall's
 * parts) span `cut`, and `onPlan` says the element belongs to the plan's own storey. False for an element with no host, one hosted
 * in something that is not a wall, or one of another storey.
 */
export function hostedInCutWall(
  meshes: readonly MeshData[], hostOf: (id: number) => number | undefined, onPlan: (id: number) => boolean,
  partsOf: (host: number) => readonly number[] = () => [],
): (id: number, cut: number) => boolean {
  let spans: Map<number, { min: number; max: number; host: boolean }> | undefined;
  const meshSpans = () => {
    if (spans) return spans;
    spans = new Map();
    for (const mesh of meshes) {
      if ((mesh.geometryClass ?? 0) === 2) continue;
      const oy = mesh.origin?.[1] ?? 0;
      const span = spans.get(mesh.expressId) ?? { min: Infinity, max: -Infinity, host: false };
      span.host ||= HOST.test(mesh.ifcType ?? '');
      for (let i = 1; i < mesh.positions.length; i += 3) {
        span.min = Math.min(span.min, oy + mesh.positions[i]);
        span.max = Math.max(span.max, oy + mesh.positions[i]);
      }
      spans.set(mesh.expressId, span);
    }
    return spans;
  };
  return (id, cut) => {
    if (!onPlan(id)) return false;
    const host = hostOf(id);
    if (host === undefined) return false;
    const all = meshSpans();
    const own = all.get(host);
    const parts = partsOf(host).map((part) => all.get(part)).filter((span) => span !== undefined);
    const pieces = [...(own?.host ? [own] : []), ...parts];
    return pieces.length > 0 && cut >= Math.min(...pieces.map((p) => p.min)) && cut <= Math.max(...pieces.map((p) => p.max));
  };
}
