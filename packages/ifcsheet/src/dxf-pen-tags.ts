/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an exported element says about its DXF layer: the layer name, the layer's own colour, pen weight (mm) and line type, and what
 * the CAD layer standard matches on beyond the layer tag. The app's sheet SVG carries them as `data-dxf-*` attributes (`sheet-dxf.ts`
 * in the app reads them); the engine's sheet writer (`sheet-dxf.ts`) builds the same tags per shape, so both resolve a layer alike (#619).
 */

import type { CadKind } from './cad-layers.js';
import type { LineType } from './draft-look.js';
import type { DraftLayer } from './draft-types.js';

export type DxfTags = Record<`data-dxf-${'layer' | 'color' | 'lw' | 'ltype'}`, string | undefined> & Partial<Record<`data-dxf-${'own-lw' | 'own-ltype' | 'print'}`, string | undefined>> & Partial<Record<`data-dxf-${'class' | 'material' | 'kind'}`, string | undefined>>;

/**
 * What the CAD layer standard (`project/cad-layers.ts`) matches on, beyond the
 * layer tag: the element's IFC class and material, or what a drafted annotation
 * is. Extra tags only; `data-dxf-layer` and the pen keep their values (the PDF
 * layers read them too), and the configured CAD names are applied at DXF write
 * time (`dxf-cad-layers.ts`).
 */
export interface DxfSubject { ifcType?: string; material?: string; kind?: string }

/** A role layer's tags (the generated drawing's pens). */
export function penTags(layer: string, widthMm: number, dashed: boolean | LineType = false, color = '#000000', subject: DxfSubject = {}): DxfTags {
  const lineType = typeof dashed === 'string' ? dashed : dashed ? 'dashed' : 'continuous';
  return { 'data-dxf-class': subject.ifcType, 'data-dxf-material': subject.material, 'data-dxf-kind': subject.kind, 'data-dxf-layer': layer, 'data-dxf-color': color, 'data-dxf-lw': String(widthMm), 'data-dxf-ltype': lineType };
}


/** A drafting layer's tags: the layer's name, colour, pen weight and line type, and whether it prints; `kind` is what a drafted annotation is. */
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

/** What a drafted annotation is, for the CAD layer standard (`cad-layers.ts`): dimension, text or hatch; other shapes none. */
export function cadKindOf(shape: { type: string }): CadKind | undefined {
  switch (shape.type) {
    case 'dimension': case 'radial': case 'angular': return 'dimension';
    case 'text': case 'leader': case 'level': return 'text';
    case 'hatch': return 'hatch';
    default: return undefined;
  }
}
