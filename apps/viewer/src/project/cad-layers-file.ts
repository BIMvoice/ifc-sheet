/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer table's reader, shared by the project file and the library
 * file (`.bvlib`) so the two agree on what a rule is. A malformed rule fails
 * with its path; a malformed optional field is dropped.
 */

import { fail } from '@/catalogue/readers';
import { CAD_KINDS, type CadKind, type CadLayerRule } from './cad-layers';

const LINE_TYPES = ['continuous', 'dashed', 'dotted', 'dashdot'] as const;
const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown): v is string => typeof v === 'string';

export function readCadLayerRule(v: unknown, path: string, what?: string): CadLayerRule {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(path, 'must be a CAD layer rule { id, layer }', what);
  const o = v as Record<string, unknown>;
  if (!str(o.id) || !str(o.layer) || !o.layer.trim()) return fail(path, 'must be a CAD layer rule { id, layer }', what);
  const out: CadLayerRule = { id: o.id, layer: o.layer };
  if (str(o.source) && o.source.trim()) out.source = o.source;
  if (CAD_KINDS.includes(o.kind as CadKind)) out.kind = o.kind as CadKind;
  if (Array.isArray(o.ifcClasses)) {
    const classes = o.ifcClasses.filter((c): c is string => str(c) && c.trim() !== '');
    if (classes.length) out.ifcClasses = classes;
  }
  if (str(o.material) && o.material.trim()) out.material = o.material;
  if (str(o.color) && HEX.test(o.color)) out.color = o.color;
  if (typeof o.lineWeight === 'number' && Number.isFinite(o.lineWeight) && o.lineWeight > 0) out.lineWeight = o.lineWeight;
  if (LINE_TYPES.includes(o.lineType as (typeof LINE_TYPES)[number])) out.lineType = o.lineType as CadLayerRule['lineType'];
  return out;
}
