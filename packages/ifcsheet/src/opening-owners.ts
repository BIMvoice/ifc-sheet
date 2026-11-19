/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which model's doors and windows a plan draws symbols for when several models are loaded (#830). A door draws one symbol:
 *
 * - When an architectural model is loaded (`model-discipline.ts`), the doors and windows of every other discipline's model draw no
 *   symbol. A structural model's copy of the architect's door would otherwise draw a second leaf and swing over the first.
 * - Of what is left, a door or window that another model already holds draws once: the same GlobalId, or the same class at the
 *   same place (footprint centres within `SAME_PLACE_M` and heights that overlap). The architectural model's copy is kept, then
 *   the one of the model loaded first.
 *
 * Within one model each door already draws one symbol (`openingSymbols` keys them by element), and a single model is passed
 * through untouched. Only the symbols are filtered: every model's walls, slabs and columns are still cut. The app's plans
 * (`view-symbols.ts`) call this; the engine opens one model at a time, so its plans have nothing to filter.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { ModelDiscipline } from './model-discipline.js';

/** Where an element comes from: its model (`key`), that model's discipline and load order, and the element's GlobalId. */
export interface OpeningSource {
  model: string;
  discipline: ModelDiscipline;
  /** Load order of the model; the lower is kept when two models hold the same door. */
  order: number;
  globalId?: string;
}

/** How close two doors' or windows' footprint centres are for them to be one, metres. */
export const SAME_PLACE_M = 0.15;

const KIND: Record<string, 'door' | 'window'> = { IFCDOOR: 'door', IFCDOORSTANDARDCASE: 'door', IFCWINDOW: 'window', IFCWINDOWSTANDARDCASE: 'window' };

interface Candidate { id: number; kind: 'door' | 'window'; source: OpeningSource; x: number; z: number; minY: number; maxY: number }

function candidates(meshes: readonly MeshData[], sourceOf: (id: number) => OpeningSource | undefined): Candidate[] {
  const byId = new Map<number, Candidate & { minX: number; maxX: number; minZ: number; maxZ: number }>();
  for (const mesh of meshes) {
    const kind = KIND[(mesh.ifcType ?? '').toUpperCase()];
    if (!kind) continue;
    let c = byId.get(mesh.expressId);
    if (!c) {
      const source = sourceOf(mesh.expressId);
      if (!source) continue;
      byId.set(mesh.expressId, c = { id: mesh.expressId, kind, source, x: 0, z: 0, minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    }
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const p = mesh.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      c.minX = Math.min(c.minX, ox + p[i]); c.maxX = Math.max(c.maxX, ox + p[i]);
      c.minY = Math.min(c.minY, oy + p[i + 1]); c.maxY = Math.max(c.maxY, oy + p[i + 1]);
      c.minZ = Math.min(c.minZ, oz + p[i + 2]); c.maxZ = Math.max(c.maxZ, oz + p[i + 2]);
    }
  }
  return [...byId.values()].filter((c) => c.minX <= c.maxX).map((c) => ({ ...c, x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 }));
}

/** What was left out of each mesh list, read once per list and loaded disciplines, not once per plan. */
const memo = new WeakMap<readonly MeshData[], { key: string; length: number; out: Set<number> }>();

const rank = (s: OpeningSource): number => (s.discipline === 'architectural' ? 0 : 1);

/**
 * The ids of the doors and windows in `meshes` that draw no symbol: those of a non-architectural model while an architectural one is
 * loaded (`disciplines`, every loaded model's), and the second copy of a door or window another model holds. Empty for one model.
 */
export function openingsLeftOut(meshes: readonly MeshData[], sourceOf: (id: number) => OpeningSource | undefined, disciplines: readonly ModelDiscipline[]): Set<number> {
  if (disciplines.length < 2) return new Set();
  const key = disciplines.join(',');
  const held = memo.get(meshes);
  if (held && held.key === key && held.length === meshes.length) return held.out;
  const out = new Set<number>();
  const archLoaded = disciplines.includes('architectural');
  const byGuid = new Map<string, Candidate>();
  // The kept doors and windows by grid cell, so a twin is looked for among the neighbours only.
  const cells = new Map<string, Candidate[]>();
  const cell = (x: number, z: number) => `${Math.floor(x / SAME_PLACE_M)},${Math.floor(z / SAME_PLACE_M)}`;
  const near = (c: Candidate): Candidate | undefined => {
    const i = Math.floor(c.x / SAME_PLACE_M), j = Math.floor(c.z / SAME_PLACE_M);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const hit = cells.get(`${i + di},${j + dj}`)?.find((k) => k.kind === c.kind && k.source.model !== c.source.model
        && Math.hypot(k.x - c.x, k.z - c.z) <= SAME_PLACE_M && k.minY <= c.maxY && c.minY <= k.maxY);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const c of candidates(meshes, sourceOf).sort((a, b) => rank(a.source) - rank(b.source) || a.source.order - b.source.order)) {
    if (archLoaded && c.source.discipline !== 'architectural') { out.add(c.id); continue; }
    const twin = (c.source.globalId ? byGuid.get(c.source.globalId) : undefined) ?? near(c);
    if (twin && twin.source.model !== c.source.model) { out.add(c.id); continue; }
    if (c.source.globalId) byGuid.set(c.source.globalId, c);
    const at = cell(c.x, c.z);
    cells.set(at, [...(cells.get(at) ?? []), c]);
  }
  memo.set(meshes, { key, length: meshes.length, out });
  return out;
}

/** `meshes` without those of the doors and windows that draw no symbol (`openingsLeftOut`); the same array when none is left out. */
export function symbolMeshes(meshes: readonly MeshData[], sourceOf: (id: number) => OpeningSource | undefined, disciplines: readonly ModelDiscipline[]): readonly MeshData[] {
  const out = openingsLeftOut(meshes, sourceOf, disciplines);
  return out.size === 0 ? meshes : meshes.filter((m) => !out.has(m.expressId));
}
