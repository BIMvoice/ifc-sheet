/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ceiling height tags of a reflected ceiling plan: for each ceiling covering,
 * its height above the storey level and a point under it to tag it at.
 *
 * The height is read from the geometry: the lowest face of the covering (the
 * soffit you see from the room) minus the level's floor, both in the mesh frame
 * (`ceiling-floor.ts`). It does not
 * read a Qto or property, because IFC4 has none for it and the placement alone
 * does not give the soffit of an extruded covering. The tag point is the
 * area-centroid of that lowest face, in the plan's drawing coordinates (viewer
 * x and z, as `tagall/footprint.ts` reads a plan). Pure: meshes in, tags out.
 */

import { sheetLevel, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type { Pt } from '@/drafting/types';

export interface CeilingMesh {
  expressId: number;
  ifcType?: string;
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  origin?: readonly number[];
}

export interface CeilingTag {
  renderId: number;
  /** Where the tag goes: the centroid of the covering's lowest face, drawing metres. */
  at: Pt;
  /** The box of the covering's lowest face, drawing metres: the tag stays inside it when it moves off something in its way. */
  extent: { x0: number; y0: number; x1: number; y1: number };
  /** The soffit's height above the level's floor, metres. */
  height: number;
  /** What the tag says in the language it was made in, e.g. `+2.70` / `+2,70`. */
  text: string;
}

/** A face this close to the lowest point counts as the soffit (metres). */
const SOFFIT_TOLERANCE = 1e-4;

/** The height as a sheet writes a level, in the language's separators (#269). */
export const ceilingHeightText = (height: number, locale: SheetLocale = 'en'): string => sheetLevel(locale, height);

/** Soffit heights a tag is kept for, in the mesh frame: strictly above `above` and strictly below `below`. */
export interface SoffitBand { above: number; below: number }

const ANY_HEIGHT: SoffitBand = { above: -Infinity, below: Infinity };

/**
 * The tags of the coverings among `meshes` that `isCeiling` accepts (by renderer id), heights measured from `floor`.
 * One tag per covering, ordered by id; a covering with no lowest face, or whose soffit lies outside `band`, is left out.
 */
export function ceilingTags(meshes: readonly CeilingMesh[], floor: number, isCeiling: (renderId: number) => boolean, band: SoffitBand = ANY_HEIGHT, locale: SheetLocale = 'en'): CeilingTag[] {
  const byId = new Map<number, CeilingMesh[]>();
  for (const m of meshes) {
    if (m.ifcType !== 'IfcCovering' || !isCeiling(m.expressId)) continue;
    byId.set(m.expressId, [...(byId.get(m.expressId) ?? []), m]);
  }
  return [...byId].sort((a, b) => a[0] - b[0]).flatMap(([renderId, parts]) => {
    const tri: number[][] = [];
    for (const m of parts) {
      const o = m.origin ?? [0, 0, 0];
      for (let t = 0; t + 2 < m.indices.length; t += 3) {
        tri.push([0, 1, 2].flatMap((k) => [0, 1, 2].map((c) => m.positions[m.indices[t + k] * 3 + c] + (o[c] ?? 0))));
      }
    }
    // A loop, not Math.min(...): a dense covering has more vertices than a call takes arguments.
    let low = Infinity;
    for (const t of tri) low = Math.min(low, t[1], t[4], t[7]);
    let area = 0, cx = 0, cz = 0;
    const extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const t of tri) {
      if (![t[1], t[4], t[7]].every((y) => Math.abs(y - low) <= SOFFIT_TOLERANCE)) continue;
      for (const [x, z] of [[t[0], t[2]], [t[3], t[5]], [t[6], t[8]]] as const) {
        extent.x0 = Math.min(extent.x0, x); extent.x1 = Math.max(extent.x1, x);
        extent.y0 = Math.min(extent.y0, z); extent.y1 = Math.max(extent.y1, z);
      }
      const a = Math.abs((t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])) / 2;
      area += a;
      cx += (a * (t[0] + t[3] + t[6])) / 3;
      cz += (a * (t[2] + t[5] + t[8])) / 3;
    }
    if (!Number.isFinite(low) || area <= 0 || !(low > band.above && low < band.below)) return [];
    const height = low - floor;
    return [{ renderId, at: { x: cx / area, y: cz / area }, extent, height, text: ceilingHeightText(height, locale) }];
  });
}

/** Tags this close and saying the same are one tag drawn twice (metres). */
const STACK_TOLERANCE = 1e-3;

/**
 * The tags grouped by what they would print: the same text at the same spot (a millimetre), as two coverings with
 * the same face give. Groups are in the order of their first tag, each in the order given, so the first of a group
 * is the one kept.
 */
export function stackedGroups<T extends Pick<CeilingTag, 'at' | 'text'>>(tags: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const t of tags) {
    const key = `${t.text}|${Math.round(t.at.x / STACK_TOLERANCE)}|${Math.round(t.at.y / STACK_TOLERANCE)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()];
}
