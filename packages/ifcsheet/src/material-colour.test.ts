/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { cutFillOf, materialsColour, viewSurfaceFills } from './material-colour.js';
import { IFC_FILL, readMaterial, type ProjectMaterial } from './materials.js';

/** A square of side 1 in the plane z = `z` (the south elevation looks along -z from z = 10), a layer of the IfcMaterial `materialId`. */
function quad(expressId: number, z: number, color: [number, number, number, number], materialId: number | undefined, ifcType = 'IfcWall', x = 0, size = 1): MeshData {
  return {
    expressId, ifcType, color, ...(materialId !== undefined ? { materialId } : {}),
    positions: new Float32Array([x, 0, z, x + size, 0, z, x + size, size, z, x, size, z]),
    normals: new Float32Array(12), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  } as unknown as MeshData;
}

const south = () => createSectionConfig('z', 10, { projectionDepth: 20, includeHiddenLines: false });
const NAMES = new Map([[71, 'Brick'], [77, 'Insulation'], [79, 'Plaster'], [90, 'Unstyled']]);
const nameOf = (mesh: MeshData): string | null => (mesh.materialId === undefined ? null : NAMES.get(mesh.materialId) ?? null);
const row = (name: string, fill?: string | null): ProjectMaterial => ({ id: name, name, ...(fill !== undefined ? { fill } : {}) });
const BRICK = [0.7, 0.3, 0.2, 1] as [number, number, number, number];
const INSUL = [0.9, 0.8, 0.1, 1] as [number, number, number, number];
const PLASTER = [0.85, 0.85, 0.85, 1] as [number, number, number, number];
/** The colour of a mesh no surface style names: the viewer's default for the class. */
const DEFAULT_WALL = [0.8, 0.8, 0.8, 1] as [number, number, number, number];

/** The colour of the face of element `id`: asserted to be one colour, and to exist. */
function colourOf(fills: ReturnType<typeof viewSurfaceFills>, id: number): string {
  const own = [...new Set(fills.filter((f) => f.entityId === id).map((f) => f.surfaceColour))];
  expect(own, `a face of element ${id}`).toHaveLength(1);
  return own[0];
}

describe('what a material Fill does to an elevation (#633)', () => {
  const layers = [quad(1, 2, BRICK, 71), quad(2, 4, INSUL, 77, 'IfcWall', 1.5), quad(3, 6, PLASTER, 79, 'IfcWall', 3), quad(4, 8, DEFAULT_WALL, 90, 'IfcWall', 4.5)];
  const draw = (table: ProjectMaterial[], mode = false) => viewSurfaceFills(layers, south(), { switch: mode, table, materialNameOf: nameOf });

  it('draws a material set to the IFC colour in the colour its surface style gives, and one with no surface style in the viewer default', () => {
    const fills = draw([row('Brick', IFC_FILL), row('Insulation', IFC_FILL), row('Plaster', IFC_FILL), row('Unstyled', IFC_FILL)]);
    expect(colourOf(fills, 1)).toBe('#b34d33');
    expect(colourOf(fills, 2)).toBe('#e6cc1a');
    expect(colourOf(fills, 3)).toBe('#d9d9d9');
    expect(colourOf(fills, 4)).toBe('#cccccc');
  });

  it('gives each material its own word: IFC colour, a colour of its own, none (white), or unset (white while another asks for a colour)', () => {
    const fills = draw([row('Brick', IFC_FILL), row('Insulation', '#00ff00'), row('Plaster', null)]);
    expect(colourOf(fills, 1)).toBe('#b34d33');
    expect(colourOf(fills, 2)).toBe('#00ff00');
    expect(colourOf(fills, 3)).toBe('#ffffff');
    expect(colourOf(fills, 4), 'a material with no row').toBe('#ffffff');
  });

  it('draws nothing for a project that sets no colour: the faces stay as they were', () => {
    expect(draw([])).toEqual([]);
    expect(draw([row('Brick'), row('Plaster', null)])).toEqual([]);
    expect(materialsColour([row('Brick'), row('Plaster', null)])).toBe(false);
  });

  it('keeps the view switch of #499 for a material that has no word, and lets a material that has one overrule it', () => {
    const fills = draw([row('Brick', null)], true);
    expect(colourOf(fills, 1), 'brick says none').toBe('#ffffff');
    expect(colourOf(fills, 2), 'insulation has no row: the mesh colour').toBe('#e6cc1a');
    expect(draw([], true).length).toBeGreaterThan(0);
  });

  it('covers a farther coloured face with a nearer one: a window in front of a wall, a roof over a wall', () => {
    const wall = quad(1, 2, BRICK, 71, 'IfcWall', 0, 4);
    const window = quad(2, 6, [0.1, 0.2, 0.8, 1], undefined, 'IfcWindow', 1, 1);
    const roof = quad(3, 8, [0.4, 0.1, 0.1, 1], 90, 'IfcRoof', 0, 4);
    const fills = viewSurfaceFills([roof, window, wall], south(), { switch: false, table: [row('Brick', IFC_FILL), row('Unstyled', '#aa0000')], materialNameOf: nameOf });
    const order = [...new Set(fills.map((f) => f.entityId))];
    expect(order, 'far to near: wall, window, roof').toEqual([1, 2, 3]);
    expect(colourOf(fills, 2), 'a window with no material is paper white and hides the brick behind it').toBe('#ffffff');
    expect(colourOf(fills, 3)).toBe('#aa0000');
  });

  it('turns the IFC colour of a cut band into its colour, and leaves every other word as it is', () => {
    expect(cutFillOf(IFC_FILL, BRICK)).toBe('#b34d33');
    expect(cutFillOf(IFC_FILL, undefined)).toBeUndefined();
    expect(cutFillOf(undefined, BRICK)).toBeUndefined();
    expect(cutFillOf(null, BRICK)).toBeNull();
    expect(cutFillOf('#123456', BRICK)).toBe('#123456');
  });

  it('reads the IFC colour back from a saved row, and still refuses any other word', () => {
    expect(readMaterial({ id: 'a', name: 'Brick', fill: 'ifc' })[0].fill).toBe(IFC_FILL);
    expect(readMaterial({ id: 'a', name: 'Brick', fill: 'blue' })[0].fill).toBeUndefined();
  });
});
