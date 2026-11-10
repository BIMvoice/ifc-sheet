/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff: for each IfcMaterial, how many elements use it and how
 * much of it there is, read from the model's own quantity sets (Qto_*); a
 * figure the model does not state is measured from the element's geometry
 * (#74, the engine's `withMeasured`) and the row says so. An element of
 * several materials shares its quantity out: a layer set by layer thickness, a
 * constituent set by its fractions, anything else evenly.
 *
 * Pure: elements in, rows out. `takeoffElementsOf` (`material-takeoff-read.ts`) reads
 * the models into that input.
 */

import type { MaterialInfo } from '@ifc-lite/parser';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import type { MeasureRefusal, QuantitySource } from './measured-quantities.js';

export interface MaterialShare {
  name: string;
  /** 0..1 of the element's quantity this material takes. */
  share: number;
}

export interface TakeoffElement {
  /** IFC class, `IfcWall`. */
  className: string;
  materials: MaterialShare[];
  /** Cubic metres, square metres; null when the model gives none and the geometry cannot. */
  volume: number | null;
  area: number | null;
  /** Where each figure comes from (#74); absent: declared. */
  volumeSource?: QuantitySource | null;
  areaSource?: QuantitySource | null;
  /** Set when the model states no volume and the geometry could not give one. */
  volumeRefusal?: MeasureRefusal;
}

export interface TakeoffRow {
  material: string;
  elements: number;
  /** Sums over the elements that state one; null when none does. */
  volume: number | null;
  area: number | null;
  /** The IFC classes it appears in, sorted. */
  classes: string[];
  /** Some of the volume, the area, is measured from geometry (#74); absent: none is. */
  measuredVolume?: boolean;
  measuredArea?: boolean;
  /** Elements whose volume the model does not state and the geometry could not give; absent: none. */
  unmeasuredVolume?: number;
}

/** How an element's materials share its quantity. Names are trimmed; unnamed parts are left out. */
export function materialShares(infos: readonly MaterialInfo[]): MaterialShare[] {
  const parts: { name: string; weight: number }[] = [];
  for (const info of infos) {
    if (info.layers?.length) {
      const total = info.layers.reduce((s, l) => s + Math.max(0, l.thickness ?? 0), 0);
      for (const l of info.layers) parts.push({ name: l.materialName ?? l.name ?? '', weight: total > 0 ? Math.max(0, l.thickness ?? 0) / total : 1 / info.layers.length });
    } else if (info.constituents?.length) {
      const total = info.constituents.reduce((s, c) => s + Math.max(0, c.fraction ?? 0), 0);
      for (const c of info.constituents) parts.push({ name: c.materialName ?? c.name ?? '', weight: total > 0 ? Math.max(0, c.fraction ?? 0) / total : 1 / info.constituents.length });
    } else if (info.profiles?.length) {
      for (const p of info.profiles) parts.push({ name: p.materialName ?? p.name ?? '', weight: 1 / info.profiles.length });
    } else if (info.materials?.length) {
      for (const m of info.materials) parts.push({ name: m.name, weight: 1 / info.materials.length });
    } else if (info.name) {
      parts.push({ name: info.name, weight: 1 });
    }
  }
  // Several associations share the element evenly between them.
  const perAssociation = infos.length > 1 ? 1 / infos.length : 1;
  const merged = new Map<string, number>();
  for (const p of parts) {
    const name = p.name.trim();
    if (name) merged.set(name, (merged.get(name) ?? 0) + p.weight * perAssociation);
  }
  return [...merged].map(([name, share]) => ({ name, share }));
}

const VOLUME_NAMES = ['NetVolume', 'GrossVolume', 'Volume'];
const AREA_NAMES = ['NetSideArea', 'GrossSideArea', 'NetArea', 'GrossArea', 'NetSurfaceArea', 'OuterSurfaceArea', 'NetFootprintArea', 'GrossFootprintArea', 'Area'];

/** The first quantity named in `order` (any set), else the first of its type; in SI by `siScale`. */
function pick(qsets: readonly QuantitySet[], type: QuantityType, order: readonly string[], siScale: number): number | null {
  const all = qsets.flatMap((s) => s.quantities).filter((q) => q.type === type && Number.isFinite(q.value));
  for (const name of order) {
    const q = all.find((x) => x.name === name);
    if (q) return q.value * siScale;
  }
  return all.length ? all[0].value * siScale : null;
}

/** An element's volume (m³) and area (m²) from its quantity sets, in the model's units scaled to SI. */
export function elementQuantities(qsets: readonly QuantitySet[], scales: { volume: number; area: number }): { volume: number | null; area: number | null } {
  return { volume: pick(qsets, QuantityType.Volume, VOLUME_NAMES, scales.volume), area: pick(qsets, QuantityType.Area, AREA_NAMES, scales.area) };
}

/** One row per material, by name, largest volume first, then by name. */
export function takeoffRows(elements: readonly TakeoffElement[]): TakeoffRow[] {
  const rows = new Map<string, TakeoffRow & { classSet: Set<string> }>();
  for (const e of elements) {
    for (const m of e.materials) {
      const row = rows.get(m.name) ?? { material: m.name, elements: 0, volume: null, area: null, classes: [], classSet: new Set<string>() };
      row.elements += 1;
      if (e.volume !== null) row.volume = (row.volume ?? 0) + e.volume * m.share;
      if (e.area !== null) row.area = (row.area ?? 0) + e.area * m.share;
      if (e.volume !== null && e.volumeSource === 'measured') row.measuredVolume = true;
      if (e.area !== null && e.areaSource === 'measured') row.measuredArea = true;
      if (e.volumeRefusal) row.unmeasuredVolume = (row.unmeasuredVolume ?? 0) + 1;
      row.classSet.add(e.className);
      rows.set(m.name, row);
    }
  }
  return [...rows.values()]
    .map(({ classSet, ...row }) => ({ ...row, classes: [...classSet].sort() }))
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.material.localeCompare(b.material));
}
