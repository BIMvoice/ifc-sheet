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
 * opening voids a wall). `openingHostsOf` reads that once per model; `hostedInCutWall` is the test `openingSymbols` takes. The
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
const WALL = /^IFCWALL/i;

const hostsByStore = new WeakMap<object, Map<number, number>>();

/** The wall each door and window of `store` is hosted in, by express id: door or window, to the IfcRelFillsElement opening, to the IfcRelVoidsElement wall. */
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
      }
    }
  }
  hostsByStore.set(store, hosts);
  return hosts;
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
 * Whether element `id` is hosted in a wall the plan at height `cut` passes through: `hostOf` names the host wall's mesh id, and the
 * wall's meshes (any IfcWall class among `meshes`) span `cut`, and `onPlan` says the element belongs to the plan's own storey. False for an
 * element with no host, one hosted in something that is not a wall, or one of another storey.
 */
export function hostedInCutWall(meshes: readonly MeshData[], hostOf: (id: number) => number | undefined, onPlan: (id: number) => boolean): (id: number, cut: number) => boolean {
  let spans: Map<number, { min: number; max: number }> | undefined;
  const wallSpans = () => {
    if (spans) return spans;
    spans = new Map();
    for (const mesh of meshes) {
      if (!WALL.test(mesh.ifcType ?? '') || (mesh.geometryClass ?? 0) === 2) continue;
      const oy = mesh.origin?.[1] ?? 0;
      const span = spans.get(mesh.expressId) ?? { min: Infinity, max: -Infinity };
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
    const wall = hostOf(id);
    const span = wall === undefined ? undefined : wallSpans().get(wall);
    return span !== undefined && cut >= span.min && cut <= span.max;
  };
}
