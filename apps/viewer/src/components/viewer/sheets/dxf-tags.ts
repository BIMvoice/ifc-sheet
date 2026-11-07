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

export { cadKindOf, layerTags, lineTags, penTags, type DxfSubject, type DxfTags } from '@bimvoice/ifcsheet/dxf';
