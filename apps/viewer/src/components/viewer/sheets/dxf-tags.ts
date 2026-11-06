/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an exported SVG element says about its DXF layer: the layer name,
 * the layer's own colour, pen weight (mm) and line type. The DXF walker
 * (`sheet-dxf.ts`) reads the nearest tagged ancestor, so a drafted entity
 * lands on its drafting layer — colour, weight and line type included — and
 * the model drawing on CUT / SEEN / HIDDEN / HATCH / SYMBOLS with its pens.
 */

import type { DraftLayer } from '@/drafting/types';
import type { LineType } from '@/drafting/styles';
import type { DxfTags } from '@bimvoice/ifcsheet/dxf';
import type { CadKind } from '@/project/cad-layers';

export { penTags, type DxfSubject, type DxfTags } from '@bimvoice/ifcsheet/dxf';

/** A drafting layer's tags. */
export function layerTags(layer: DraftLayer | undefined, kind?: string): DxfTags {
  return {
    'data-dxf-kind': kind,
    'data-dxf-layer': layer?.name ?? '0',
    'data-dxf-color': layer?.color ?? '#000000',
    'data-dxf-lw': String(layer?.lineWeight ?? 0.25),
    'data-dxf-ltype': layer?.lineType ?? 'continuous',
    'data-dxf-print': layer?.print === false ? '0' : undefined,
  };
}

/** A drafted line's tags: its layer's, and the weight and line type the element overrides (`entityPen`), which the DXF writes on the entity itself. */
export function lineTags(layer: DraftLayer | undefined, own: { lineWeight?: number; lineType?: string }): DxfTags {
  return {
    ...layerTags(layer),
    'data-dxf-own-lw': own.lineWeight !== undefined ? String(own.lineWeight) : undefined,
    'data-dxf-own-ltype': own.lineType,
  };
}

/** What a drafted annotation is, for the CAD layer standard (`project/cad-layers.ts`): dimension, text or hatch; other shapes none. */
export function cadKindOf(shape: { type: string }): CadKind | undefined {
  switch (shape.type) {
    case 'dimension': case 'radial': case 'angular': return 'dimension';
    case 'text': case 'leader': case 'level': return 'text';
    case 'hatch': return 'hatch';
    default: return undefined;
  }
}
