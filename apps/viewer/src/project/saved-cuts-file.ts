/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the named section cuts of a project file. A cut that cannot be read
 * is dropped, not fatal: it is a convenience list, not the drawing.
 */

import { HATCH_PATTERN_IDS, type SectionCapStyle } from '@ifc-lite/renderer';
import type { SavedSectionCut } from './types';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const AXES = ['down', 'front', 'side'] as const;

const rgba = (v: unknown): SectionCapStyle['fillColor'] | null =>
  Array.isArray(v) && v.length === 4 && v.every(isNumber) ? [v[0], v[1], v[2], v[3]] : null;

function readCapStyle(v: unknown): SectionCapStyle | null {
  if (!isObject(v)) return null;
  const fillColor = rgba(v.fillColor);
  const strokeColor = rgba(v.strokeColor);
  if (!fillColor || !strokeColor || typeof v.pattern !== 'string' || !(v.pattern in HATCH_PATTERN_IDS)) return null;
  if (![v.spacingPx, v.angleRad, v.widthPx, v.secondaryAngleRad].every(isNumber)) return null;
  return {
    fillColor, strokeColor, pattern: v.pattern as SectionCapStyle['pattern'],
    spacingPx: v.spacingPx as number, angleRad: v.angleRad as number, widthPx: v.widthPx as number, secondaryAngleRad: v.secondaryAngleRad as number,
  };
}

export function readSavedSectionCuts(raw: unknown): SavedSectionCut[] {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !isObject(raw.plane)) return [];
  const p = raw.plane;
  const capStyle = readCapStyle(p.capStyle);
  if (!capStyle || !AXES.includes(p.axis as (typeof AXES)[number]) || !isNumber(p.position)) return [];
  return [{
    id: raw.id, name: raw.name, createdAt: isNumber(raw.createdAt) ? raw.createdAt : 0, updatedAt: isNumber(raw.updatedAt) ? raw.updatedAt : 0,
    plane: {
      axis: p.axis as (typeof AXES)[number], position: p.position, flipped: p.flipped === true, capStyle,
      showCap: p.showCap !== false, showOutlines: p.showOutlines !== false,
      ...(isObject(p.custom) ? { custom: p.custom as unknown as SavedSectionCut['plane']['custom'] } : {}),
    },
  }];
}
