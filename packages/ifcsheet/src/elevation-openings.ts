/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The door and window symbols of an elevation or section, made the way the app makes them (`project/view-symbols.ts` there): every door
 * and window the drawing shows whose face the view looks at and that has a joinery type (configured, or mapped by the project) gets its
 * frame, panels and opening marks (and glazing bars, arched head and transom row) over the projected mesh, and every door without one
 * that states its operation gets the opening lines of that operation. A section that cuts a door or window keeps the cut the drawing
 * has; the symbols go over it. The headless sheets (`set-sheets.ts`) and the app both call `elevationOpeningSymbols`.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { DoorOperation } from './door-operation.js';
import type { DrawnJoinery } from './joinery-schedule.js';
import { statedDoorElevationSymbol, typedElevationSymbol } from './joinery-elevation-placement.js';
import type { OpeningConvention } from './joinery-symbols.js';
import type { OpeningSymbol } from './opening-symbols.js';

/** Door and window classes, by the mesh's IFC type. */
const JOINERY_CLASS = /^IFC(DOOR|WINDOW)(STANDARDCASE)?$/i;

/** The elements a drawing shows at least partly (after hidden-line removal). */
export function visibleEntities(drawing: Pick<Drawing2D, 'lines'> | null | undefined): Set<number> {
  const out = new Set<number>();
  for (const l of drawing?.lines ?? []) if (l.visibility !== 'hidden') out.add(l.entityId);
  return out;
}

/** What an elevation's openings are read with: the configured joinery and stated operation of an element by its express id, and its flips. */
export interface ElevationReads {
  typedOf: (id: number) => DrawnJoinery | null;
  operationOf: (id: number) => DoorOperation | null;
  /** The drawing's own flips of an element (bit 1 the hand, bit 2 the swing side), by express id. */
  flipsOf: (id: number) => number;
}

/** `visible`: the elements the drawing shows (`visibleEntities`); `hidden`: the classes the view hides (`hiddenClassesOf`). */
export function elevationOpeningSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, visible: ReadonlySet<number>, hidden: ReadonlySet<string>, reads: ElevationReads, convention: OpeningConvention = 'handle',
): OpeningSymbol[] {
  if (plane.axis === 'y' || plane.customPlane) return [];
  const byId = new Map<number, { kind: 'door' | 'window'; world: number[]; l2w?: number[] }>();
  for (const mesh of meshes) {
    const cls = (mesh.ifcType ?? '').toUpperCase();
    if (!JOINERY_CLASS.test(cls) || !visible.has(mesh.expressId) || (mesh.geometryClass ?? 0) === 2) continue;
    const kind = cls.startsWith('IFCDOOR') ? 'door' : 'window';
    if (hidden.has(kind === 'door' ? 'IFCDOOR' : 'IFCWINDOW')) continue;
    const entry = byId.get(mesh.expressId) ?? { kind, world: [] };
    entry.l2w ??= mesh.localToWorld;
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) entry.world.push(ox + p[i], oy + p[i + 1], oz + p[i + 2]);
    byId.set(mesh.expressId, entry);
  }
  const out: OpeningSymbol[] = [];
  for (const [id, entry] of byId) {
    const drawn = entry.l2w ? reads.typedOf(id) : null;
    const placed = drawn && entry.l2w ? typedElevationSymbol(drawn.spec, entry.world, entry.l2w, plane, drawn.flips, { convention }) : null;
    if (placed) { out.push({ id, kind: entry.kind, shapes: placed.thin, dashed: placed.dashed }); continue; }
    // No configured type: a door's stated operation, turned by the drawing's own flips as its plan symbol is (a configured type wins, above).
    const stated = entry.kind === 'door' && entry.l2w && !drawn ? reads.operationOf(id) : null;
    const own = stated && entry.l2w ? statedDoorElevationSymbol(stated, entry.world, entry.l2w, plane, reads.flipsOf(id), { convention }) : null;
    if (own) out.push({ id, kind: 'door', shapes: own.thin, dashed: own.dashed });
  }
  return out;
}
