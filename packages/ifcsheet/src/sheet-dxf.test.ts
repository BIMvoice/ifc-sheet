/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: the sheet DXF is the app's writer: R2000, and the app's layer for each thing (FRAME, TITLEBLOCK, CUT, SEEN, HIDDEN, SYMBOLS,
 * VIEWPORT-LABELS, SITE-SYMBOLS), resolved through the project's CAD layer standard when it has one. The app and CLI on one real sheet are held
 * together by `apps/viewer/src/components/viewer/sheets/sheet-dxf-cli.parity.fzk.test.tsx`.
 */

import { describe, expect, it } from 'vitest';
import type { CadLayerRule } from './cad-layers.js';
import { dxfText } from './__fixtures__/dxf-text.js';
import type { SheetGraphic } from './sheet-graphic.js';

const run = (y: number) => [{ x: 10, y }, { x: 60, y }];
const sheet: SheetGraphic = {
  sheetId: 's', number: 'A-101', name: 'Plan', paper: { w: 420, h: 297 },
  frame: [[{ x: 5, y: 5 }, { x: 415, y: 5 }, { x: 415, y: 292 }, { x: 5, y: 292 }, { x: 5, y: 5 }], run(20)],
  fills: [], cut: [], lines: [],
  pens: [
    { layer: 'CUT', stroke: '#000000', width: 0.5, fill: null, runs: [run(100)], regions: [] },
    { layer: 'SEEN', stroke: '#000000', width: 0.25, fill: null, runs: [run(110)], regions: [] },
    { layer: 'HIDDEN', stroke: '#000000', width: 0.18, fill: null, dash: [2, 1], runs: [run(120)], regions: [] },
    { layer: 'SYMBOLS', stroke: '#000000', width: 0.25, fill: null, runs: [run(130)], regions: [] },
  ],
  symbols: { strokes: [run(140)], solids: [] }, marks: [], texts: [
    { at: { x: 20, y: 30 }, text: 'Plan 1:100', size: 3.5, layer: 'VIEWPORT-LABELS' },
    { at: { x: 30, y: 280 }, text: 'A-101', size: 5, layer: 'TITLEBLOCK' },
    { at: { x: 50, y: 150 }, text: 'N', size: 3, layer: 'SITE-SYMBOLS' },
  ],
  images: [], underlays: [], viewports: [],
};

/** The layer of every entity of a DXF text, from its group codes. */
function entityLayers(dxf: string): Map<string, number> {
  const lines = dxf.split(/\r?\n/);
  const out = new Map<string, number>();
  const start = lines.findIndex((l, i) => l.trim() === 'ENTITIES' && lines[i - 1]?.trim() === '2');
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0') continue;
    if (lines[i + 1].trim() === 'ENDSEC') break;
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) if (lines[j].trim() === '8') out.set(lines[j + 1], (out.get(lines[j + 1]) ?? 0) + 1);
  }
  return out;
}

describe('the sheet DXF (#619)', () => {
  it('is DXF R2000, as the app writes', () => {
    const lines = dxfText(sheet).split(/\r?\n/);
    expect(lines[lines.findIndex((l) => l.trim() === '$ACADVER') + 2].trim()).toBe('AC1015');
  });

  it('puts each thing on the layer the app puts it on', () => {
    expect([...entityLayers(dxfText(sheet)).keys()].sort()).toEqual(['CUT', 'FRAME', 'HIDDEN', 'SEEN', 'SITE-SYMBOLS', 'SYMBOLS', 'TITLEBLOCK', 'VIEWPORT-LABELS']);
  });

  it('renames a layer through the project\'s CAD layer standard, as the app does', () => {
    const rules: CadLayerRule[] = [{ id: 'r1', source: 'CUT', layer: 'A-WALL-CUT', color: '#ff0000', lineWeight: 0.35 }];
    const dxf = dxfText(sheet, { cadLayers: rules });
    const layers = entityLayers(dxf);
    expect(layers.has('A-WALL-CUT')).toBe(true);
    expect(layers.has('CUT')).toBe(false);
    expect(layers.has('SEEN')).toBe(true);
  });
});
