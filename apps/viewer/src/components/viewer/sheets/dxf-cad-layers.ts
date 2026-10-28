/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer standard applied at DXF write time: a drawn element's tags
 * (`dxf-tags.ts`) in, the layer it is written on and its pens out. Pure, so a
 * DWG writer (#52) takes the same step. With no rules, or no rule matching,
 * the element keeps the layer and pens its tags name — an empty table writes
 * today's DXF byte for byte.
 */

import { resolveCadLayer, type CadLayerRule } from '@/project/cad-layers';
import type { PenSpec } from './dxf-r2000';

/** The pen of the layer an element is on (from its tags), and the element's own colour. */
function pensOf(tag: (name: string) => string | undefined, colour: string): TaggedPens {
  const lt = tag('ltype');
  const lineType = lt || 'continuous';
  const weight = (name: string) => {
    const n = Number(tag(name));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const lineWeight = weight('lw') ?? 0.25;
  return {
    layer: { color: tag('color') ?? colour, lineType, lineWeight, ...(tag('print') === '0' ? { print: false } : {}) },
    own: { color: colour, lineType: tag('own-ltype') || lineType, lineWeight: weight('own-lw') ?? lineWeight },
  };
}

export interface TaggedPens { layer: PenSpec; own: PenSpec }

/**
 * The layer an element is written on and its pens. `tag(name)` reads a
 * `data-dxf-<name>` value from the element's nearest tagged ancestor, `name`
 * is its `data-dxf-layer`, `colour` its own stroke or fill.
 */
export function layerAndPens(
  rules: readonly CadLayerRule[], tag: (name: string) => string | undefined, name: string, colour: string,
): { name: string } & TaggedPens {
  const pens = pensOf(tag, colour);
  if (rules.length === 0) return { name, ...pens };
  const choice = resolveCadLayer(rules, { source: name, kind: tag('kind'), ifcClass: tag('class'), material: tag('material') });
  if (!choice) return { name, ...pens };
  const over = (p: PenSpec): PenSpec => ({
    ...p,
    color: choice.color ?? p.color,
    lineType: choice.lineType ?? p.lineType,
    lineWeight: choice.lineWeight ?? p.lineWeight,
  });
  return { name: choice.name, layer: over(pens.layer), own: over(pens.own) };
}
