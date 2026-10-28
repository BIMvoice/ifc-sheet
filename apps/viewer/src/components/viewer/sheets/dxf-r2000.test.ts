/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { HatchPattern } from '@bimvoice/ifcsheet/hatch';
import { aciOf, DxfR2000, dxfLineWeight } from './dxf-r2000';

const read = (w: DxfR2000) => new TextDecoder('windows-1252').decode(w.bytes('test'));

describe('DxfR2000', () => {
  it('maps colours and pen widths to DXF values', () => {
    assert.equal(aciOf('#000000'), 7);
    assert.equal(aciOf('rgb(224, 80, 80)'), 1);
    assert.equal(dxfLineWeight(0.25), 25);
    assert.equal(dxfLineWeight(0.7), 70);
    assert.equal(dxfLineWeight(0.33), 35);
  });

  it('writes layers with colour, line type and weight, entities BYLAYER, and a handle seed above every handle', () => {
    const w = new DxfR2000(100);
    const walls = w.layer('A-WALL dims', { color: '#e05050', lineType: 'dashed', lineWeight: 0.5 });
    w.line({ x: 0, y: 0 }, { x: 1, y: 0 }, walls, { color: '#e05050', lineType: 'dashed', lineWeight: 0.5 });
    w.polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], walls, { color: '#0000ff', lineType: 'dashed', lineWeight: 0.5 }, true);
    w.text({ x: 0, y: 0 }, 'Note', 2.5, walls);
    const text = read(w);
    assert.match(text, /\$ACADVER\n\s*1\nAC1015/);
    assert.match(text, /\n\s*2\nA-WALL dims\n\s*70\n0\n\s*62\n1\n420\n14700624\n\s*6\nDASHED\n370\n50\n/);
    assert.match(text, /\n\s*2\nDASHED\n[\s\S]*?\n\s*49\n300\n/, 'dashes scaled to the view');
    assert.match(text, /LINE\n[\s\S]*?\n\s*8\nA-WALL dims\n100\nAcDbLine/, 'the line takes everything BYLAYER');
    assert.match(text, /LWPOLYLINE\n[\s\S]*?\n\s*8\nA-WALL dims\n\s*62\n5\n/, 'the blue polyline carries its own colour');
    const body = text.slice(text.indexOf('ENDSEC'));
    const handles = [...body.matchAll(/\n {2}5\n([0-9A-F]+)\n/g)].map((m) => parseInt(m[1], 16));
    const seed = parseInt(/\$HANDSEED\n\s*5\n([0-9A-F]+)/.exec(text)?.[1] ?? '0', 16);
    assert.ok(handles.length > 10 && handles.every((h) => h < seed), 'the handle seed is above every handle');
    assert.equal(new Set(handles).size, handles.length, 'handles are unique');
  });

  it('writes a hatch pattern\'s line offset (codes 45 and 46) turned by the line\'s angle, so lines are as far apart in CAD as in the .pat (#516)', () => {
    // One family per angle, each 3 mm between its lines and 1 mm along: ANSI31's 45 degrees, a vertical family (PARQUET's), 30 degrees and a horizontal one.
    const angles = [0, 30, 45, 90, 135];
    const pattern: HatchPattern = { name: 'TURNED', description: '', families: angles.map((angleDeg) => ({ angleDeg, origin: { x: 0, y: 0 }, deltaX: 1, deltaY: 3, dashes: [] })) };
    for (const mirrored of [false, true]) {
      const w = new DxfR2000(1);
      w.patternHatch([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]], pattern, 1, 'HATCHES', undefined, mirrored);
      const lines = read(w).split(/\r?\n/).map((l) => l.trim());
      const from = lines.indexOf('78');
      const families = [];
      for (let k = from + 2; k < lines.length && families.length < angles.length; k++) {
        if (lines[k] === '53') families.push({ angle: Number(lines[k + 1]), dx: Number(lines[k + 7]), dy: Number(lines[k + 9]) });
      }
      assert.equal(families.length, angles.length);
      families.forEach((f, i) => {
        const a = (f.angle * Math.PI) / 180;
        // Along the line the offset is 1 mm and across it 3 mm, in the DXF's own axes.
        assert.ok(Math.abs(f.dx * Math.cos(a) + f.dy * Math.sin(a) - 1) < 1e-3, `${angles[i]} degrees (mirrored ${mirrored}): 1 mm along the line`);
        assert.ok(Math.abs(Math.abs(-f.dx * Math.sin(a) + f.dy * Math.cos(a)) - 3) < 1e-3, `${angles[i]} degrees (mirrored ${mirrored}): 3 mm between the lines`);
      });
    }
  });
});
