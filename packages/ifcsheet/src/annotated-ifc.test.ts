/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotated copy on a small IFC2X3 model in millimetres, one storey turned a quarter circle and moved away from the origin:
 * where the points land in the storey's own frame, what is written in the file's schema, the marks, and what is left out and said.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAnnotatedIfc, type AnnotatedView } from './annotated-ifc.js';

/** IFC2X3, millimetres; its one storey is turned a quarter circle and moved to (10, 20) m; two walls with Tags W-1 and W-2. */
const MODEL = readFileSync(fileURLToPath(new URL('./__fixtures__/annotated-2x3.ifc', import.meta.url)), 'utf8');

const bytes = () => new TextEncoder().encode(MODEL);
const STOREY = '0storey000000000000000';

const view = (patch: Partial<AnnotatedView> = {}): AnnotatedView => ({
  viewId: 'v1',
  name: 'Level 1',
  scale: 50,
  storeyGlobalIds: [STOREY],
  curves: [{ type: 'polyline', points: [{ x: 2, y: 3 }, { x: 2, y: 4 }] }],
  texts: [{ position: { x: 2, y: 3 }, direction: { x: 1, y: 0 }, text: 'Kitchen', width: 1, height: 0.25 }],
  ...patch,
});

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('the annotated copy of an IFC2X3 model in millimetres', () => {
  it('writes the points in the storey\'s own frame and unit, and the text direction turned with the storey', async () => {
    const r = await buildAnnotatedIfc({ source: bytes(), views: [view()] });
    const out = text(r.bytes);
    expect(r.schema).toBe('IFC2X3');
    // The model's point (2,3) m; the storey sits at (10,20) m with its x along the model's +Y: local (-17, 8) m.
    expect(out).toContain('IFCCARTESIANPOINT((-17000.,8000.))');
    // And (2,4), a metre further on, is a metre further along the storey's -x.
    expect(out).toContain('IFCCARTESIANPOINT((-16000.,8000.))');
    // The model's +X is the storey's -y.
    expect(out).toContain('IFCDIRECTION((0.,-1.))');
    expect(out).toContain('IFCPLANAREXTENT(1000.,250.)');
  });

  it('writes IFC2X3 entities with the model\'s owner history, in a new Plan context, contained in the storey', async () => {
    const out = text((await buildAnnotatedIfc({ source: bytes(), views: [view()] })).bytes);
    expect(out).toMatch(/IFCGEOMETRICREPRESENTATIONCONTEXT\(\$,'Plan',3,(1\.E-05|0\.00001),#8,\$\)/);
    expect(out).toMatch(/IFCGEOMETRICREPRESENTATIONSUBCONTEXT\('Annotation','Plan',\*,\*,\*,\*,#\d+,\$,\.PLAN_VIEW\.,\$\)/);
    expect(out).toMatch(/IFCANNOTATION\('[^']{22}',#6,'Level 1',\$,'IfcSheet:PlanAnnotations',#\d+,#\d+\)/);
    expect(out).toMatch(/IFCRELCONTAINEDINSPATIALSTRUCTURE\('[^']{22}',#6,\$,\$,\(#\d+\),#35\)/);
    expect(out).toMatch(/IFCPROPERTYSET\('[^']{22}',#6,'IfcSheet_Annotation',\$,\(#\d+,#\d+\)\)/);
  });

  it('gives the mark as a property only where the Tag does not already say it', async () => {
    const r = await buildAnnotatedIfc({
      source: bytes(),
      views: [view()],
      marks: [
        { globalId: '0wall000000000000000000', mark: 'W-1', views: ['Level 1'] },
        { globalId: '0wall200000000000000000', mark: 'W-9', views: ['Level 1', 'Ground'] },
        { globalId: 'does-not-exist', mark: 'X', views: [] },
      ],
    });
    expect(r.marked.map((m) => m.mark)).toEqual(['W-9']);
    expect(r.notes.map((n) => n.key)).toEqual(['markInTag', 'markNoElement']);
    const out = text(r.bytes);
    expect(out).toMatch(/IFCPROPERTYSINGLEVALUE\('Mark',\$,IFCLABEL\('W-9'\),\$\)/);
    expect(out).toMatch(/IFCPROPERTYSINGLEVALUE\('TaggedOn',\$,IFCTEXT\('Level 1, Ground'\),\$\)/);
    expect(out).toMatch(/IFCRELDEFINESBYPROPERTIES\('[^']{22}',#6,\$,\$,\(#43\),#\d+\)/);
    expect(out).not.toContain("IFCLABEL('W-1')");
  });

  it('says what it did not write: a view whose level is not in this file, an empty view, a view kind it does not write, a tilted storey', async () => {
    const r = await buildAnnotatedIfc({
      source: bytes(),
      views: [view({ viewId: 'a', name: 'Elsewhere', storeyGlobalIds: ['not-here'] }), view({ viewId: 'b', name: 'Blank', curves: [], texts: [] })],
      leftOut: [{ viewId: 'c', name: 'Section A', kind: 'section' }],
    });
    expect(r.annotations).toEqual([]);
    expect(r.notes.map((n) => [n.key, n.params.view])).toEqual([['viewLeftOut', 'Section A'], ['noStorey', 'Elsewhere'], ['viewEmpty', 'Blank']]);
    expect(text(r.bytes)).not.toContain('IFCANNOTATION');
  });

  it('leaves out a storey whose placement is tilted out of plan, and says so', async () => {
    const tilted = new TextEncoder().encode(MODEL.replace('#33=IFCDIRECTION((0.,0.,1.));', '#33=IFCDIRECTION((1.,0.,0.));'));
    const r = await buildAnnotatedIfc({ source: tilted, views: [view()] });
    expect(r.annotations).toEqual([]);
    expect(r.notes).toEqual([{ key: 'storeyFrame', params: { view: 'Level 1' } }]);
  });

  it('refuses a coordinate that is not a number rather than writing it into STEP', async () => {
    await expect(buildAnnotatedIfc({ source: bytes(), views: [view({ curves: [{ type: 'polyline', points: [{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }] }] })] })).rejects.toThrow(/finite/);
  });
});
