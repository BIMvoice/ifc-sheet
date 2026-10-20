/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer standard in the DXF: a drawing goes through the real pen
 * builder (`viewportPens`), the real tags (`penTags`) and the real layer step
 * (`layerAndPens`) into the R2000 writer, and the DXF text is read back — the
 * LAYER table and each entity's layer (group code 8).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { isoStarterRules } from '@/project/cad-layers-iso.js';
import type { CadLayerRule } from '@/project/cad-layers.js';
import { DxfR2000 } from './dxf-r2000.js';
import { layerAndPens } from './dxf-cad-layers.js';
import { penTags } from './dxf-tags.js';
import { viewportPens, type CadPenContext } from './viewport-pens.js';

const line = (entityId: number, ifcType: string, category: 'cut' | 'projection' = 'cut', y = 0) => ({
  line: { start: { x: 0, y }, end: { x: 1, y } }, category, visibility: 'visible', entityId, ifcType, modelIndex: 0, depth: 0,
});
const drawing = {
  lines: [line(1, 'IfcWall'), line(2, 'IfcWall', 'cut', 1), line(3, 'IfcDoor', 'cut', 2), line(1, 'IfcWall', 'projection', 3)],
  cutPolygons: [], bounds: null,
} as unknown as Drawing2D;
// Wall 1 is concrete, wall 2 is brick; nothing says what the door is made of.
const cad: CadPenContext = { materialOf: (id) => (id === 1 ? 'Beton armat' : id === 2 ? 'Cărămidă' : null) };
const T = { x: 1, y: 1 };

/** Group-code pairs of a DXF text, as records starting at each group 0. */
function records(dxf: string): { type: string; pairs: [string, string][] }[] {
  const lines = dxf.split('\n');
  const out: { type: string; pairs: [string, string][] }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].replace(/\r$/, '');
    if (code === '0') out.push({ type: value, pairs: [] });
    else out.at(-1)?.pairs.push([code, value]);
  }
  return out;
}
const get = (r: { pairs: [string, string][] }, code: string) => r.pairs.find(([c]) => c === code)?.[1];

/** The drawing as the DXF walker writes it: pens → tags → layer and pens → writer. */
function write(rules: readonly CadLayerRule[], withCad = rules.length > 0): { layers: Map<string, { aci: string; true: string; weight: string; ltype: string }>; entities: { type: string; layer: string }[]; text: string } {
  const w = new DxfR2000();
  for (const p of viewportPens(drawing, undefined, { scale: 1000, ...T }, 'down', [], undefined, withCad ? cad : undefined)) {
    if (!p.stroke) continue;
    const tags = penTags(p.layer, p.width, !!p.dash, p.stroke, p);
    const pens = layerAndPens(rules, (n) => tags[`data-dxf-${n}` as keyof typeof tags], p.layer, p.stroke);
    const layer = w.layer(pens.name, pens.layer);
    w.line({ x: 0, y: 0 }, { x: 1, y: 0 }, layer, pens.own);
  }
  const text = new TextDecoder('windows-1252').decode(w.bytes('test'));
  const recs = records(text);
  const layers = new Map(recs.filter((r) => r.type === 'LAYER').map((r) => [get(r, '2') ?? '', { aci: get(r, '62') ?? '', true: get(r, '420') ?? '', weight: get(r, '370') ?? '', ltype: get(r, '6') ?? '' }]));
  return { layers, entities: recs.filter((r) => r.type === 'LINE').map((r) => ({ type: r.type, layer: get(r, '8') ?? '' })), text };
}

describe('CAD layer standard in the DXF', () => {
  // Table order is the precedence: the material rule sits above the class rule, so concrete takes it.
  const rules: CadLayerRule[] = [
    { id: 'm', source: 'CUT', ifcClasses: ['IfcWall'], material: 'Beton armat', layer: 'S-BETON', color: '#ff0000', lineWeight: 0.7, lineType: 'dashed' },
    { id: 'c', source: 'CUT', ifcClasses: ['IfcWall'], layer: 'A-WALL-CUT', color: '#7f1d1d', lineWeight: 0.5 },
  ];

  it('puts a wall of a mapped material on the configured layer with its colour, pen and line type', () => {
    const { layers, entities } = write(rules);
    const concrete = layers.get('S-BETON');
    assert.ok(concrete, 'the LAYER table has the configured layer');
    assert.deepEqual(concrete, { aci: '1', true: String(0xff0000), weight: '70', ltype: 'DASHED' });
    const names = entities.map((e) => e.layer).sort();
    assert.ok(names.includes('S-BETON'), 'an entity of the concrete wall is on it (group code 8)');
    assert.ok(names.includes('A-WALL-CUT'), 'the brick wall falls to the class rule');
    assert.ok(names.includes('CUT'), 'the door matches no rule and keeps its fixed layer');
    assert.ok(names.includes('SEEN'), 'so does the concrete wall seen beyond the cut, which no rule names');
    assert.equal(layers.get('A-WALL-CUT')?.true, String(0x7f1d1d));
  });

  it('puts the concrete wall on the class rule\'s layer when that rule is above the material rule (PR #112 review)', () => {
    const { layers, entities } = write([rules[1], rules[0]]);
    assert.equal(layers.has('S-BETON'), false, 'the material rule below the class rule never matches');
    assert.ok(entities.some((e) => e.layer === 'A-WALL-CUT'));
    assert.equal(entities.some((e) => e.layer === 'S-BETON'), false);
  });

  it('writes a layer name with ș ț ă as deterministic ASCII, and the same DXF every time', () => {
    const romanian: CadLayerRule[] = [{ id: 'r', source: 'CUT', ifcClasses: ['IfcWall'], material: 'Beton armat', layer: 'Pereți țesuți ă', color: '#00ff00' }];
    const a = write(romanian);
    assert.ok(a.layers.has('Pereti tesuti a'), [...a.layers.keys()].join('|'));
    assert.ok(a.entities.some((e) => e.layer === 'Pereti tesuti a'));
    assert.equal(/[?\u0080-￿]/.test(a.text.slice(a.text.indexOf('ENTITIES'))), false, 'no placeholder or non-ASCII byte in the entities');
    assert.equal(write(romanian).text, a.text);
  });

  it('matches a material name written with diacritics as the model has it', () => {
    const r: CadLayerRule[] = [{ id: 'r', source: 'CUT', material: 'Cărămidă', layer: 'ZIDARIE' }];
    assert.ok(write(r).entities.some((e) => e.layer === 'ZIDARIE'));
  });

  it('writes today\'s DXF, byte for byte, with an empty table or one that matches nothing', () => {
    const today = write([], false);
    assert.deepEqual([...today.layers.keys()].filter((n) => n !== '0' && n !== 'Defpoints').sort(), ['CUT', 'SEEN']);
    // Today's writer, driven straight from the pens: the fixed layer name, the pen's own colour, weight and line type.
    const direct = new DxfR2000();
    for (const p of viewportPens(drawing, undefined, { scale: 1000, ...T }, 'down', [])) {
      const pen = { color: p.stroke ?? '#000000', lineType: p.dash ? ('dashed' as const) : ('continuous' as const), lineWeight: p.width };
      direct.line({ x: 0, y: 0 }, { x: 1, y: 0 }, direct.layer(p.layer, pen), pen);
    }
    assert.equal(today.text, new TextDecoder('windows-1252').decode(direct.bytes('test')), 'the same bytes as the writer driven without the standard');
    assert.equal(write([]).text, today.text, 'an empty table');
    const nothing: CadLayerRule[] = [{ id: 'n', source: 'CUT', ifcClasses: ['IfcSlab'], layer: 'S-SLAB' }];
    assert.equal(write(nothing, false).text, today.text, 'a table of rules for other classes');
  });

  it('leaves the SVG tags as they were without a standard: no class or material tags, pens not split', () => {
    const pens = viewportPens(drawing, undefined, { scale: 1000, ...T }, 'down', []);
    assert.equal(pens.length, 2, 'one CUT pen and one SEEN pen');
    for (const p of pens) assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(penTags(p.layer, p.width, !!p.dash, p.stroke ?? '#000000', p)))).sort(), ['data-dxf-color', 'data-dxf-layer', 'data-dxf-ltype', 'data-dxf-lw']);
  });

  it('writes the ISO-style starter: cut and seen walls on their own layers', () => {
    const { layers } = write(isoStarterRules());
    assert.ok(layers.has('A-21----E-----------CUT') && layers.has('A-21----E-----------SEEN') && layers.has('A-31----E-----------CUT'), [...layers.keys()].join('|'));
    assert.equal(layers.get('A-21----E-----------CUT')?.weight, '50');
  });
});
