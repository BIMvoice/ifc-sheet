/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A 3D view's print settings as read from a project file; what is not recognised is dropped. */

import { AXONOMETRIC_PRESETS } from './axonometric';
import type { AxonometricPreset, ThreeDProjectView } from './types';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function read3dPrint(v: Record<string, unknown>): Partial<ThreeDProjectView> {
  const r = v.raster;
  return {
    ...(v.projection === 'axonometric' || v.projection === 'perspective' ? { projection: v.projection } : {}),
    ...(AXONOMETRIC_PRESETS.includes(v.preset as AxonometricPreset) ? { preset: v.preset as AxonometricPreset } : {}),
    ...(v.shaded === true ? { shaded: true } : {}),
    ...(isObject(r) && typeof r.href === 'string' && [r.widthPx, r.heightPx, r.widthMm, r.heightMm].every(positive)
      ? { raster: { href: r.href, widthPx: r.widthPx as number, heightPx: r.heightPx as number, widthMm: r.widthMm as number, heightMm: r.heightMm as number } }
      : {}),
  };
}
