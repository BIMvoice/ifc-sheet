/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one styler of a view (#34): the layers in their order, one pen table for cut, projection and hidden lines, and the
 * preset's property rules.
 */

import { describe, expect, it } from 'vitest';
import { DASH_MM, DEFAULT_FACE_FILL, HIDDEN_DASH_MM, PEN_TABLE, elementProperties, viewStyler, type StyleItem } from './view-style.js';
import { penGroups } from './drawing-pens.js';
import type { ViewGraphics } from './view-graphics-types.js';

const GID = '2O2Fr$t4X7Zf8NOew3FLOH';
const wallFace: StyleItem = { entityId: 7, ifcType: 'IfcWallStandardCase' };
const line = (category: string, extra: Partial<StyleItem> = {}): StyleItem => ({ entityId: 7, ifcType: 'IfcWallStandardCase', category, visibility: 'visible', line: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, ...extra });
const gidOf = (id: number) => (id === 7 ? GID : undefined);

describe('viewStyler: the pens with nothing said', () => {
  const s = viewStyler({ graphics: undefined });
  it('cut lines and cut-face outlines take the cut pen, a silhouette the outline pen, other lines the seen pen, hidden lines the hidden pen and dash', () => {
    expect(s.face(wallFace)).toMatchObject({ kind: 'cut', weight: PEN_TABLE.pens.cut, stroke: '#000000', fill: DEFAULT_FACE_FILL, dash: [] });
    expect(s.line(line('cut'))).toMatchObject({ kind: 'cut', weight: 0.5 });
    expect(s.line(line('silhouette'))).toMatchObject({ kind: 'projection', weight: PEN_TABLE.pens.outline });
    expect(s.line(line('projection'))).toMatchObject({ kind: 'projection', weight: 0.25 });
    expect(s.line(line('crease'))).toMatchObject({ kind: 'projection', weight: 0.25 });
    expect(s.line(line('projection', { visibility: 'hidden' }))).toMatchObject({ kind: 'hidden', weight: 0.18, dash: HIDDEN_DASH_MM });
    expect(s.line(line('hidden'))).toMatchObject({ kind: 'hidden', weight: 0.18 });
  });

  it('is the table the printed sheets used: a weight word is the cut pen, and half of it seen beyond the cut', () => {
    expect(PEN_TABLE.weights).toEqual({
      heavy: { cut: 0.7, projection: 0.35 }, medium: { cut: 0.5, projection: 0.25 }, light: { cut: 0.25, projection: 0.125 }, hairline: { cut: 0.13, projection: 0.065 },
    });
  });
});

describe('viewStyler: the layers, each later one winning', () => {
  it('a category weight is the cut pen on cut lines and outlines, the projection pen beyond the cut; hidden lines keep the hidden pen', () => {
    const s = viewStyler({ graphics: { categories: { walls: { lineWeight: 'heavy', lineColor: '#cc0000' } } } });
    expect(s.face(wallFace)).toMatchObject({ weight: 0.7, stroke: '#cc0000' });
    expect(s.line(line('cut'))).toMatchObject({ weight: 0.7, stroke: '#cc0000' });
    expect(s.line(line('projection'))).toMatchObject({ weight: 0.35, stroke: '#cc0000' });
    expect(s.line(line('hidden'))).toMatchObject({ weight: 0.18, stroke: '#cc0000', dash: HIDDEN_DASH_MM });
  });

  it('the preset\'s rules apply (colour, fill, weight word through the pen table), and the category wins over them', () => {
    const preset = viewStyler({ graphics: { presetId: 'preset-architectural' } });
    const p = preset.face(wallFace);
    expect(p.weight).toBe(PEN_TABLE.weights.heavy.cut);
    expect(p.stroke).toBe('#000000');
    const both = viewStyler({ graphics: { presetId: 'preset-architectural', categories: { walls: { lineWeight: 'hairline', fillColor: '#00ff00' } } } });
    expect(both.face(wallFace)).toMatchObject({ weight: 0.13, fill: '#00ff00' });
  });

  it('a property rule reads the element\'s properties: LoadBearing walls are blue under the structural preset, the others are not', () => {
    const props: Record<number, Record<string, Record<string, unknown>>> = { 7: { Pset_WallCommon: { LoadBearing: true } }, 8: { Pset_WallCommon: { LoadBearing: false } } };
    const s = viewStyler({ graphics: { presetId: 'preset-structural' }, propertiesOf: (id) => props[id] });
    expect(s.readsProperties).toBe(true);
    expect(s.face(wallFace)).toMatchObject({ stroke: '#1565C0', fill: '#BBDEFB', weight: 0.7 });
    expect(s.face({ entityId: 8, ifcType: 'IfcWallStandardCase' }).stroke).not.toBe('#1565C0');
    expect(viewStyler({ graphics: { presetId: 'preset-structural' } }).face(wallFace).stroke).not.toBe('#1565C0');
  });

  it('a material fill is over the preset\'s and under the category\'s; null is no fill (the paper)', () => {
    expect(viewStyler({ graphics: undefined }).face({ ...wallFace, materialFill: '#123456' }).fill).toBe('#123456');
    expect(viewStyler({ graphics: undefined }).face({ ...wallFace, materialFill: null }).fill).toBe('#ffffff');
    expect(viewStyler({ graphics: { presetId: 'preset-monochrome' } }).face({ ...wallFace, materialFill: '#123456' }).fill).toBe('#123456');
    expect(viewStyler({ graphics: { categories: { walls: { fillColor: '#abcdef' } } } }).face({ ...wallFace, materialFill: '#123456' }).fill).toBe('#abcdef');
  });

  it('a phase draws over its category; the element\'s own word over the phase, field by field', () => {
    const phaseStyle = () => ({ lineColor: '#808080', lineWeight: 'light' as const, dashed: true, fillColor: '#eeeeee' });
    const graphics: ViewGraphics = { categories: { walls: { lineColor: '#0000cc', lineWeight: 'heavy' } }, elements: { [GID]: { lineColor: '#00ff00' } } };
    const phased = viewStyler({ graphics: { categories: graphics.categories }, phaseStyle });
    expect(phased.line(line('cut', { phase: 'demolish' }))).toMatchObject({ stroke: '#808080', weight: 0.25, dash: DASH_MM });
    const s = viewStyler({ graphics, phaseStyle, globalIdOf: gidOf });
    expect(s.line(line('cut', { phase: 'demolish' }))).toMatchObject({ stroke: '#00ff00', weight: 0.25, dash: DASH_MM });
    expect(s.face({ ...wallFace, phase: 'demolish' }).fill).toBe('#eeeeee');
  });

  it('an element override: its cut and projection weights, its dash, its fill; hidden by the view, it is not visible', () => {
    const graphics: ViewGraphics = { elements: { [GID]: { cutWeight: 'heavy', projectionWeight: 'hairline', lineStyle: 'dashed', fillColor: '#101010' } } };
    const s = viewStyler({ graphics, globalIdOf: gidOf });
    expect(s.face(wallFace)).toMatchObject({ weight: 0.7, dash: DASH_MM, fill: '#101010', visible: true });
    expect(s.line(line('projection'))).toMatchObject({ weight: 0.065 });
    const hidden = viewStyler({ graphics: { hiddenElements: [GID] }, globalIdOf: gidOf });
    expect(hidden.face(wallFace).visible).toBe(false);
    expect(viewStyler({ graphics: { categories: { walls: { visible: false } } } }).face(wallFace).visible).toBe(false);
  });

  it('a colour scheme\'s fill is the strongest word on a face; halftone lightens what the layers chose', () => {
    const graphics: ViewGraphics = { categories: { walls: { fillColor: '#abcdef' } }, elements: { [GID]: { fillColor: '#101010' } } };
    const s = viewStyler({ graphics, globalIdOf: gidOf });
    expect(s.face({ ...wallFace, schemeColour: '#ff8800' })).toMatchObject({ fill: '#ff8800', scheme: true });
    const halftone = viewStyler({ graphics: undefined, ink: (c) => `${c}-half` });
    expect(halftone.face(wallFace)).toMatchObject({ fill: `${DEFAULT_FACE_FILL}-half`, stroke: '#000000-half' });
  });

  it('a weight word means what the pen table says (a project standard brings its own)', () => {
    const pens = { ...PEN_TABLE, weights: { ...PEN_TABLE.weights, light: { cut: 0.35, projection: 0.18 } } };
    expect(viewStyler({ graphics: { categories: { walls: { lineWeight: 'light' } } }, pens }).face(wallFace).weight).toBe(0.35);
  });
});

describe('penGroups', () => {
  it('groups by pen, leaves out what the view hides, and keeps a scheme fill on its own layer', () => {
    const s = viewStyler({ graphics: { hiddenElements: [GID] }, globalIdOf: (id) => (id === 7 ? GID : `other-${id}`) });
    const other = (category: string) => ({ ...line(category), entityId: 9 });
    const groups = penGroups([{ ...wallFace, entityId: 9 }, { ...wallFace, entityId: 9, schemeColour: '#ff8800' }, wallFace], [other('cut'), other('cut'), other('projection'), line('cut')], s);
    expect(groups.map((g) => [g.layer, g.faces.length + g.lines.length])).toEqual([['FILL', 1], ['COLOUR', 1], ['CUT', 2], ['SEEN', 1]]);
  });
});

describe('elementProperties', () => {
  it('merges two sets of one name, the earlier winning a property both have', () => {
    expect(elementProperties([{ name: 'P', properties: [{ name: 'a', value: 1 }] }, { name: 'P', properties: [{ name: 'a', value: 2 }, { name: 'b', value: 3 }] }])).toEqual({ P: { a: 1, b: 3 } });
  });
});
