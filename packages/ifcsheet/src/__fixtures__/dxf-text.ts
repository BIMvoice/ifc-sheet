/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { encodeDxfCp1252 } from '@ifc-lite/drawing-2d';
import type { SheetGraphic } from '../sheet-graphic.js';
import { sheetGraphicToDxf, type SheetDxfOptions } from '../sheet-dxf.js';

/** Bytes as text, one character per byte (what Latin-1 gives), so a windows-1252 letter is compared by its byte, not by a decoder's idea of 0x80-0x9f. */
export const byteText = (bytes: Uint8Array): string => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

/** A sheet's DXF as text, one character per byte (`byteText`), for a test to read. */
export const dxfText = (sheet: SheetGraphic, options?: SheetDxfOptions): string => byteText(sheetGraphicToDxf(sheet, options));

/** A value as it reads in `dxfText` when written as a TEXT: its windows-1252 bytes (the letters windows-1252 lacks are the writer's job to escape first). */
export const asWritten = (value: string): string => byteText(encodeDxfCp1252(value).bytes);

/** The layers that carry an entity in a DXF text, sorted (a layer in the table with nothing on it is not one). */
export function dxfLayers(dxf: string): string[] {
  const lines = dxf.split(/\r?\n/);
  const out = new Set<string>();
  const start = lines.findIndex((l, i) => l.trim() === 'ENTITIES' && lines[i - 1]?.trim() === '2');
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0') continue;
    if (lines[i + 1].trim() === 'ENDSEC') break;
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) if (lines[j].trim() === '8') out.add(lines[j + 1]);
  }
  return [...out].sort();
}

/** A layer's line weight in the LAYER table, in hundredths of a millimetre (group code 370); undefined when the layer is not in the table. */
export function dxfLayerWeight(dxf: string, layer: string): number | undefined {
  const lines = dxf.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'LAYER') continue;
    let name = '';
    let weight: number | undefined;
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) {
      if (lines[j].trim() === '2') name = lines[j + 1];
      if (lines[j].trim() === '370') weight = Number(lines[j + 1]);
    }
    if (name === layer) return weight;
  }
  return undefined;
}
