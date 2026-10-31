/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A material whose Fill is "IFC colour" draws its cut band in the colour the model gives that layer (#633), where an unset one keeps the
 * plain grey cut: the section of a wall of brick, insulation and plaster shows each layer in its own colour.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { IFC_FILL, type ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { materialDrawing } from './material-drawing';
import { styledDrawing } from './view-graphics';

const NAMES = ['Brick', 'Insulation', 'Plaster', 'Unstyled'];
const COLOURS: [number, number, number, number][] = [[0.7, 0.3, 0.2, 1], [0.9, 0.8, 0.1, 1], [0.85, 0.85, 0.85, 1], [0.8, 0.8, 0.8, 1]];
const bands = NAMES.map((_n, i): DrawingPolygon => ({
  polygon: { outer: [{ x: i, y: 0 }, { x: i + 0.9, y: 0 }, { x: i + 0.9, y: 3 }, { x: i, y: 3 }], holes: [] },
  entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId: 70 + i, color: COLOURS[i],
}));
const drawing = { cutPolygons: bands, lines: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 3 } } } as unknown as Drawing2D;

/** The fill of the band of `name` in the styled section: what `view-style` then paints it with. */
function fillOf(table: ProjectMaterial[], name: string): unknown {
  const materials = materialDrawing(drawing, {
    graphics: (p) => { const n = NAMES[(p.materialId ?? 70) - 70]; const row = table.find((m) => m.name === n); return row ? { ...row, auto: false } : null; },
    layers: () => null, membrane: () => false,
  });
  const styled = styledDrawing(drawing, undefined, undefined, undefined, materials);
  const at = NAMES.indexOf(name);
  return styled.cutPolygons.find((p) => p.materialId === 70 + at)?.materialFill;
}

describe('the cut band of a material set to the IFC colour (#633)', () => {
  const row = (name: string, fill?: string | null): ProjectMaterial => ({ id: name, name, ...(fill !== undefined ? { fill } : {}) });

  it('takes the colour the model gives the layer, each layer its own', () => {
    const table = NAMES.map((n) => row(n, IFC_FILL));
    assert.equal(fillOf(table, 'Brick'), '#b34d33');
    assert.equal(fillOf(table, 'Insulation'), '#e6cc1a');
    assert.equal(fillOf(table, 'Plaster'), '#d9d9d9');
    assert.equal(fillOf(table, 'Unstyled'), '#cccccc', 'a material with no surface style takes the colour the viewer shows for it');
  });

  it('leaves an unset material to the plain cut, and keeps none (white) and a colour of its own', () => {
    const table = [row('Brick'), row('Insulation', null), row('Plaster', '#123456')];
    assert.equal(fillOf(table, 'Brick'), undefined);
    assert.equal(fillOf(table, 'Insulation'), null);
    assert.equal(fillOf(table, 'Plaster'), '#123456');
  });
});
