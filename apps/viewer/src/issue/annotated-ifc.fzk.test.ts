/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotated copy from the app's side (#82): the drafts of a project on AC20-FZK-Haus, a tag and a dimension on each of its two
 * plans, are turned into annotations (`collectAnnotations`) and written by the engine into a copy of the file. Checked on what the
 * copy holds: the text of the tags and the dimension figure, the annotations on their storeys, the marks only where the Tag does
 * not say them, and the views and shapes that are left out, said.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildAnnotatedIfc } from '@bimvoice/ifcsheet/annotated-ifc';
import { IfcParser } from '@ifc-lite/parser';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { collectAnnotations, type AnnotationSource } from './annotated-ifc-collect';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const GROUND = '2eyxpyOx95m90jmsXLOuR0';
const ROOF = '273g3wqLzDtfYIl7qqkgcO';
const WALL_A = '2XPyKWY018sA1ygZKgQPtU';
const WALL_B = '3PfS__Y_DBAfq5naM6zD2Z';
const WALL_C = '2ptk1k7qn8_Qk22vjh$0DE';
const WALL_B_TAG = '40F78310-9E7E-4793-BC-9E-DB102FD72B73';

const plan = (id: string, name: string, storey: string, elevation: number): ProjectView => ({
  id, name, kind: 'plan', createdAt: 0, scale: 100, cutHeight: 1.2, level: { name, elevation, storeyGlobalIds: [storey] },
});
const draft = (id: string, viewId: string, shape: DraftEntity['shape'], params: DraftEntity['params'] = {}, layerId = '0'): DraftEntity => ({ id, viewId, layerId, shape, params });

const layers: DraftLayer[] = [{ id: '0', name: '0', color: '#000', visible: true, locked: false }, { id: 'hidden', name: 'Hidden', color: '#000', visible: false, locked: false }];

const tag = (id: string, viewId: string, guid: string, text: string, field = 'mark') =>
  draft(id, viewId, { type: 'leader', pts: [{ x: 3, y: -2 }, { x: 4, y: -3 }], text, height: 0.25 }, { tagOf: guid, tagField: field });
const dimension = (id: string, viewId: string) =>
  draft(id, viewId, { type: 'dimension', variant: 'aligned', a: { x: 1, y: -1 }, b: { x: 5, y: -1 }, at: { x: 3, y: -1.5 }, height: 0.25 });

const project: AnnotationSource = {
  views: [plan('p0', 'Ground floor', GROUND, 0), plan('p1', 'Roof floor', ROOF, 2.7), { id: 's1', name: 'Section A', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: 1, flipped: false } }],
  levels: [],
  draftLayers: layers,
  drafts: [
    tag('t1', 'p0', WALL_A, 'W-1'),
    tag('t2', 'p0', WALL_B, WALL_B_TAG),
    tag('t3', 'p0', WALL_C, 'Wand-Int-ERDG-1', 'name'),
    dimension('d1', 'p0'),
    tag('t4', 'p1', WALL_A, 'W-1'),
    dimension('d2', 'p1'),
    draft('h1', 'p1', { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], pattern: 'solid', scale: 1, angle: 0 }),
    draft('x1', 'p1', { type: 'text', p: { x: 0, y: 0 }, text: 'On a hidden layer', height: 0.25, rotation: 0 }, {}, 'hidden'),
    draft('s1', 's1', { type: 'text', p: { x: 0, y: 0 }, text: 'Cut', height: 0.25, rotation: 0 }),
  ],
};

describe('the annotated copy of AC20-FZK-Haus from a project\'s drafts', { skip: !existsSync(FZK) }, () => {
  it('collects the plans, the marks and what it leaves out', () => {
    const c = collectAnnotations(project, { x: 0, y: 0 }, 'en');
    assert.deepEqual(c.views.map((v) => [v.name, v.storeyGlobalIds]), [['Ground floor', [GROUND]], ['Roof floor', [ROOF]]]);
    assert.deepEqual(c.leftOut, [{ viewId: 's1', name: 'Section A', kind: 'section' }]);
    assert.equal(c.hatches, 1);
    // The tag that shows a name is not a mark; the same element tagged on two plans is one mark with both plans.
    assert.deepEqual(c.marks.map((m) => [m.globalId, m.mark, m.views]), [[WALL_A, 'W-1', ['Ground floor', 'Roof floor']], [WALL_B, WALL_B_TAG, ['Ground floor']]]);
    const ground = c.views[0];
    // A tag is a leader and its text; a dimension is its extension lines, its line, its ticks and its figure.
    assert.ok(ground.texts.some((t) => t.text === 'W-1'));
    assert.ok(ground.texts.some((t) => t.text === '4.00'));
    assert.ok(!c.views[1].texts.some((t) => t.text === 'On a hidden layer'));
  });

  it('puts a point where the model is: drawing y runs down the plan, the model\'s Y up it', () => {
    const [ground] = collectAnnotations(project, { x: 0, y: 0 }, 'en').views;
    const leader = ground.curves.find((c) => c.type === 'polyline' && c.points.length === 2 && c.points[0].x === 3 && c.points[0].y === 2);
    assert.ok(leader, 'the tag leader starts at the drawing (3,-2): the model (3,2)');
    const moved = collectAnnotations(project, { x: 10, y: 20 }, 'en').views[0];
    assert.ok(moved.curves.some((c) => c.type === 'polyline' && c.points[0].x === 13 && c.points[0].y === 22), 'the render-frame offset is added');
  });

  it('writes it into a copy: texts on their storeys, the mark only where the Tag differs, the source untouched', async () => {
    const source = new Uint8Array(readFileSync(FZK));
    const before = Buffer.from(source).toString('base64');
    const c = collectAnnotations(project, { x: 0, y: 0 }, 'en');
    const r = await buildAnnotatedIfc({ source, views: c.views, marks: c.marks, leftOut: c.leftOut, fileName: 'Haus annotated.ifc' });
    assert.equal(Buffer.from(source).toString('base64'), before);
    assert.deepEqual(r.annotations.map((a) => a.name), ['Ground floor', 'Roof floor']);
    assert.deepEqual(r.marked.map((m) => [m.globalId, m.mark]), [[WALL_A, 'W-1']]);
    assert.deepEqual(r.marks.map((m) => m.state), ['written', 'inTag']);

    const ds = await new IfcParser().parseColumnar(r.bytes.slice().buffer as ArrayBuffer, { disableWorkerScan: true });
    const storey = (guid: string) => [...ds.spatialHierarchy!.byStorey.keys()].find((id) => ds.entities.getGlobalId(id) === guid) as number;
    assert.ok(ds.spatialHierarchy!.byStorey.get(storey(GROUND))!.includes(r.annotations[0].expressId));
    assert.ok(ds.spatialHierarchy!.byStorey.get(storey(ROOF))!.includes(r.annotations[1].expressId));
    const out = new TextDecoder().decode(r.bytes);
    assert.equal(out.match(/IFCTEXTLITERALWITHEXTENT\('W-1'/g)?.length, 2);
    assert.equal(out.match(/IFCTEXTLITERALWITHEXTENT\('4.00'/g)?.length, 2);
    assert.ok(out.includes("IFCPROPERTYSINGLEVALUE('Mark',$,IFCLABEL('W-1'),$)"));
    assert.ok(out.includes("IFCPROPERTYSINGLEVALUE('TaggedOn',$,IFCTEXT('Ground floor, Roof floor'),$)"));
    assert.ok(out.includes("FILE_NAME('Haus annotated.ifc'"));
  });

  it('gives every dimension, horizontal and vertical, one text literal, the vertical one turned to read bottom to top', async () => {
    const dims: AnnotationSource = {
      ...project,
      views: [plan('p0', 'Ground floor', GROUND, 0)],
      drafts: [
        dimension('h', 'p0'),
        draft('v', 'p0', { type: 'dimension', variant: 'aligned', a: { x: 12, y: 0 }, b: { x: 12, y: -3 }, at: { x: 14, y: -1.5 }, height: 0.25 }),
        draft('w', 'p0', { type: 'dimension', variant: 'aligned', a: { x: 2, y: 0 }, b: { x: 2, y: -5 }, at: { x: 0.5, y: -2.5 }, height: 0.25 }),
      ],
    };
    const source = new Uint8Array(readFileSync(FZK));
    const c = collectAnnotations(dims, { x: 0, y: 0 }, 'en');
    const r = await buildAnnotatedIfc({ source, views: c.views, marks: [] });
    const lines = new Map([...new TextDecoder().decode(r.bytes).matchAll(/^#(\d+)=([^\n]*);$/gm)].map((m) => [Number(m[1]), m[2]]));
    const literal = (text: string) => {
      const found = [...lines.values()].filter((l) => l.startsWith(`IFCTEXTLITERALWITHEXTENT('${text}'`));
      assert.equal(found.length, 1, `one literal for ${text}`);
      const placement = lines.get(Number(/,#(\d+),\.RIGHT\./.exec(found[0])![1]))!;
      const dir = /^IFCAXIS2PLACEMENT2D\(#\d+,(\$|#(\d+))\)$/.exec(placement)!;
      return dir[2] ? lines.get(Number(dir[2])) : null;
    };
    assert.equal(literal('4.00'), null, 'a horizontal figure keeps the placement axis');
    assert.equal(literal('3.00'), 'IFCDIRECTION((0.,1.))', 'a vertical figure runs up the sheet');
    assert.equal(literal('5.00'), 'IFCDIRECTION((0.,1.))', 'on the left of a line too');
  });
});
