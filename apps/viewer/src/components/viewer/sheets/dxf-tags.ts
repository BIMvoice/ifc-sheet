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
import type { CadKind } from '@/project/cad-layers';

export type DxfTags = Record<`data-dxf-${'layer' | 'color' | 'lw' | 'ltype'}`, string | undefined> & Partial<Record<`data-dxf-${'class' | 'material' | 'kind'}`, string | undefined>>;

/**
 * What the CAD layer standard (`project/cad-layers.ts`) matches on, beyond the
 * layer tag: the element's IFC class and material, or what a drafted annotation
 * is. Extra tags only; `data-dxf-layer` and the pen keep their values (the PDF
 * layers read them too), and the configured CAD names are applied at DXF write
 * time (`dxf-cad-layers.ts`).
 */
export interface DxfSubject { ifcType?: string; material?: string; kind?: string }

/** A drafting layer's tags. */
export function layerTags(layer: DraftLayer | undefined, kind?: string): DxfTags {
  return {
    'data-dxf-kind': kind,
    'data-dxf-layer': layer?.name ?? '0',
    'data-dxf-color': layer?.color ?? '#000000',
    'data-dxf-lw': String(layer?.lineWeight ?? 0.25),
    'data-dxf-ltype': layer?.lineType ?? 'continuous',
  };
}

/** A role layer's tags (the generated drawing's pens). */
export function penTags(layer: string, widthMm: number, dashed = false, color = '#000000', subject: DxfSubject = {}): DxfTags {
  return { 'data-dxf-class': subject.ifcType, 'data-dxf-material': subject.material, 'data-dxf-kind': subject.kind, 'data-dxf-layer': layer, 'data-dxf-color': color, 'data-dxf-lw': String(widthMm), 'data-dxf-ltype': dashed ? 'dashed' : 'continuous' };
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
