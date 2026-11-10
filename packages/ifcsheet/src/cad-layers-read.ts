/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's CAD layer table as a saved project holds it (`cadLayers`), read as the app reads it (`apps/viewer/src/project/cad-layers-file.ts`,
 * `readCadLayerRule`): a malformed rule is refused with its path, a malformed optional field is dropped. The command line writes its DXF through
 * these rules (#619), so an office's layer standard applies to `ifcsheet build` as it does to the app.
 */

import { CAD_KINDS, type CadKind, type CadLayerRule } from './cad-layers.js';
import type { LineType } from './draft-look.js';

const LINE_TYPES: readonly LineType[] = ['continuous', 'dashed', 'dotted', 'dashdot'];
const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown): v is string => typeof v === 'string';

/** A CAD layer rule read from a project file; throws, with the path, on one that is not a rule. */
export function readCadLayerRule(v: unknown, path: string): CadLayerRule {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`Not a project file: ${path} must be a CAD layer rule { id, layer }`);
  const o = v as Record<string, unknown>;
  if (!str(o.id) || !str(o.layer) || !o.layer.trim()) throw new Error(`Not a project file: ${path} must be a CAD layer rule { id, layer }`);
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
  if (LINE_TYPES.includes(o.lineType as LineType)) out.lineType = o.lineType as LineType;
  return out;
}
