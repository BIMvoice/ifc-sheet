/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an exported element says about its DXF layer: the layer name, the layer's own colour, pen weight (mm) and line type, and what
 * the CAD layer standard matches on beyond the layer tag. The app's sheet SVG carries them as `data-dxf-*` attributes (`sheet-dxf.ts`
 * in the app reads them); the engine's sheet writer (`sheet-dxf.ts`) builds the same tags per shape, so both resolve a layer alike (#619).
 */

import type { LineType } from './draft-look.js';

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

