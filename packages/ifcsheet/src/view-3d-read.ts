/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A 3D view's print settings as read from a project file; what is not recognised is dropped. */

import { AXONOMETRIC_PRESETS } from './axonometric.js';
import type { ProjectLevel } from './document.js';
import type { AxonometricPreset, ThreeDProjectView } from './view-3d-types.js';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const point = (v: unknown): { x: number; y: number; z: number } | null => (isObject(v) && finite(v.x) && finite(v.y) && finite(v.z) ? { x: v.x, y: v.y, z: v.z } : null);

/** A cut-away's storey cut and section box (#97); a part that does not read is dropped, and with both gone so is the cut-away. */
function readCutaway(v: unknown): ThreeDProjectView['cutaway'] | null {
  if (!isObject(v)) return null;
  const s = v.storey;
  const level = isObject(s) && isObject(s.level) && typeof s.level.name === 'string' && finite(s.level.elevation) ? s.level : null;
  const storey = level && isObject(s) && finite(s.cutHeight)
    ? { level: { name: level.name as string, elevation: level.elevation as number, storeyGlobalIds: Array.isArray(level.storeyGlobalIds) ? level.storeyGlobalIds.filter((g): g is string => typeof g === 'string') : [] } satisfies ProjectLevel, cutHeight: s.cutHeight }
    : null;
  const b = isObject(v.box) ? { min: point(v.box.min), max: point(v.box.max) } : null;
  const box = b?.min && b.max && b.min.x < b.max.x && b.min.y < b.max.y && b.min.z < b.max.z ? { min: b.min, max: b.max } : null;
  if (!storey && !box) return null;
  return { ...(storey ? { storey } : {}), ...(box ? { box } : {}) };
}

export function read3dPrint(v: Record<string, unknown>): Partial<ThreeDProjectView> {
  const r = v.raster;
  const cutaway = readCutaway(v.cutaway);
  return {
    ...(cutaway ? { cutaway } : {}),
    ...(v.projection === 'axonometric' || v.projection === 'perspective' ? { projection: v.projection } : {}),
    ...(AXONOMETRIC_PRESETS.includes(v.preset as AxonometricPreset) ? { preset: v.preset as AxonometricPreset } : {}),
    ...(v.shaded === true ? { shaded: true } : {}),
    ...(isObject(r) && typeof r.href === 'string' && [r.widthPx, r.heightPx, r.widthMm, r.heightMm].every(positive)
      ? { raster: { href: r.href, widthPx: r.widthPx as number, heightPx: r.heightPx as number, widthMm: r.widthMm as number, heightMm: r.heightMm as number } }
      : {}),
  };
}
