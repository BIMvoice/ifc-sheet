/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #548: AC20-FZK-Haus with two views and one sheet exported, read the way Bonsai reads drawings and sheets. The STEP is checked
 * structurally (the entities, attributes and relationships Bonsai's `tool.Drawing` reads); where a Python with `ifcopenshell` is on
 * the machine, `test-support/check-bonsai.py` applies Bonsai's own listing rules and the schema's. The export opened again in
 * IfcSheet adds no camera to the plan and no second annotation (#487).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAnnotatedIfc, type AnnotatedIfcInput, type AnnotatedView } from './annotated-ifc.js';
import { generateViewDrawings, openModel } from './headless.js';
import { levelsFromStoreys } from './view-defaults.js';
import type { PlanProjectView } from './document.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../test-support/check-bonsai.py', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
const GROUND = '2eyxpyOx95m90jmsXLOuR0';
const ROOF = '273g3wqLzDtfYIl7qqkgcO';

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3', 'python'].filter((p): p is string => !!p)) {
    try { execFileSync(py, ['-c', 'import ifcopenshell.validate'], { stdio: 'ignore' }); return py; } catch { /* not this one */ }
  }
  return null;
}
const python = findPython();

const view = (id: string, name: string, storey: string, scale: number): AnnotatedView => ({
  viewId: id, name, scale, storeyGlobalIds: [storey],
  curves: [{ type: 'polyline', points: [{ x: 2, y: 3 }, { x: 3, y: 4 }] }, { type: 'polyline', points: [{ x: 1, y: 0.6 }, { x: 5, y: 0.6 }] }],
  texts: [{ position: { x: 3, y: 4 }, text: 'W1', width: 0.9, height: 0.25 }, { position: { x: 2.5, y: 0.7 }, text: '4,00', width: 0.8, height: 0.25 }],
});

const added = (source: string, out: string): string => {
  const had = new Set([...source.matchAll(/^#(\d+)\s*=/gm)].map((m) => m[1]));
  return [...out.matchAll(/^#(\d+)\s*=[^\n]*;$/gm)].filter((m) => !had.has(m[1])).map((m) => m[0]).join('\n');
};

describe.skipIf(missing !== null)('AC20-FZK-Haus with two views and a sheet, written for Bonsai (#548)', () => {
  const source = new Uint8Array(readFileSync(FZK));
  const sourceText = new TextDecoder().decode(source);
  const input: AnnotatedIfcInput = {
    source,
    views: [view('v-ground', 'Ground floor', GROUND, 100), view('v-roof', 'Roof floor', ROOF, 50)],
    sheets: [{ name: 'Plans', identification: 'A01', viewIds: ['v-ground', 'v-roof'] }],
  };

  it('writes each view as a DRAWING annotation with its EPset_Drawing, camera, group and document', async () => {
    const r = await buildAnnotatedIfc(input);
    const out = added(sourceText, new TextDecoder().decode(r.bytes));
    expect(out.match(/IFCANNOTATION\('[^']+',#12,'(Ground floor|Roof floor)',\$,'DRAWING',/g)).toHaveLength(2);
    expect(out.match(/IFCPROPERTYSET\('[^']+',#12,'EPset_Drawing'/g)).toHaveLength(2);
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('Scale',$,IFCLABEL('1/100'),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('Scale',$,IFCLABEL('1/50'),$)");
    expect(out.match(/IFCPROPERTYSINGLEVALUE\('TargetView',\$,IFCLABEL\('PLAN_VIEW'\),\$\)/g)).toHaveLength(2);
    // The paths Bonsai reads its stylesheet and symbol files from, with its defaults (core.drawing.add_drawing).
    for (const [name, value] of [['Stylesheet', 'drawings/assets/default.css'], ['Markers', 'drawings/assets/markers.svg'], ['Symbols', 'drawings/assets/symbols.svg'], ['Patterns', 'drawings/assets/patterns.svg'], ['ShadingStyles', 'drawings/assets/shading_styles.json'], ['CurrentShadingStyle', 'Blender Default']]) {
      expect(out.match(new RegExp(`IFCPROPERTYSINGLEVALUE\\('${name}',\\$,IFCLABEL\\('${value}'\\),\\$\\)`, 'g'))).toHaveLength(2);
    }
    // The camera looks down: a rectangle extruded along -Z, in the model's Body context.
    expect(out.match(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,1\.2\)/g)).toHaveLength(2);
    expect(out).toMatch(/IFCDIRECTION\(\(0\.,0\.,-1\.\)\)/);
    expect(out.match(/IFCSHAPEREPRESENTATION\(#\d+,'Body','SweptSolid'/g)).toHaveLength(2);
    // The groups: one DRAWINGS parent, one DRAWING group per view holding the drawing and the view's annotation.
    expect(out.match(/IFCGROUP\('[^']+',#12,'DRAWINGS',\$,'DRAWINGS'\)/g)).toHaveLength(1);
    expect(out.match(/IFCGROUP\('[^']+',#12,'(Ground floor|Roof floor)',\$,'DRAWING'\)/g)).toHaveLength(2);
    for (const a of r.annotations) {
      expect(out).toMatch(new RegExp(`IFCRELASSIGNSTOGROUP\\('[^']+',#12,\\$,\\$,\\(#${a.drawingExpressId},#${a.expressId}\\),\\$,#${a.drawingGroupExpressId}\\)`));
    }
    // The documents: DRAWINGS parent, one per drawing, each reference associated to its drawing.
    expect(out.match(/IFCDOCUMENTINFORMATION\('(X|DRAWINGS)','[^']*',\$,\$,\$,\$,'(DRAWING|DRAWINGS)'/g)).toHaveLength(3);
    expect(out.match(/IFCRELASSOCIATESDOCUMENT\(/g)).toHaveLength(4); // each drawing's reference, and the DRAWINGS parent and the sheet to the project
    expect(out.match(/IFCDOCUMENTINFORMATIONRELATIONSHIP\(\$,\$,#\d+,\(#\d+,#\d+\),\$\)/g)).toHaveLength(1);
  });

  it('writes the sheet with a layout and one reference per drawing, repeating the drawing\'s location', async () => {
    const r = await buildAnnotatedIfc(input);
    const out = added(sourceText, new TextDecoder().decode(r.bytes));
    expect(r.sheets).toEqual([{ name: 'Plans', expressId: expect.any(Number), viewIds: ['v-ground', 'v-roof'] }]);
    expect(out).toMatch(/IFCDOCUMENTINFORMATION\('A01','Plans',\$,\$,\$,\$,'SHEET'/);
    expect(out).toContain("IFCDOCUMENTREFERENCE('layouts/A01 - Plans.svg',$,$,'LAYOUT',#");
    for (const [n, name] of [[1, 'Ground floor'], [2, 'Roof floor']] as const) {
      // The reference on the sheet and the drawing's own reference share one Location: how Bonsai finds the sheets of a drawing.
      expect(out.match(new RegExp(`IFCDOCUMENTREFERENCE\\('drawings/${name}\\.svg',`, 'g'))).toHaveLength(2);
      expect(out).toContain(`IFCDOCUMENTREFERENCE('drawings/${name}.svg','${n}',$,'DRAWING',#`);
    }
  });

  it('a second export of the exported file reuses the DRAWINGS parents and writes no drawing twice', async () => {
    const first = await buildAnnotatedIfc(input);
    const again = await buildAnnotatedIfc({ ...input, source: first.bytes, views: [...input.views, view('v-extra', 'Ground floor B', GROUND, 100)] });
    const text = new TextDecoder().decode(again.bytes);
    expect(text.match(/IFCANNOTATION\('[^']+',#12,'[^']*',\$,'DRAWING',/g)).toHaveLength(3);
    expect(again.annotations.filter((a) => a.drawingExpressId !== undefined).map((a) => a.name)).toEqual(['Ground floor B']);
    expect(text.match(/IFCGROUP\('[^']+',#12,'DRAWINGS',\$,'DRAWINGS'\)/g)).toHaveLength(1);
    expect(text.match(/IFCDOCUMENTINFORMATION\('DRAWINGS',/g)).toHaveLength(1);
    // One relationship from the parent document and one assignment to the parent group, each now holding all three.
    expect(text.match(/IFCDOCUMENTINFORMATIONRELATIONSHIP\(\$,\$,#\d+,\(#\d+,#\d+,#\d+\),\$\)/g)).toHaveLength(1);
    expect(text.match(/IFCDOCUMENTINFORMATIONRELATIONSHIP\(/g)).toHaveLength(1);
    expect(text.match(/IFCRELASSIGNSTOGROUP\('[^']+',#12,\$,\$,\(#\d+,#\d+,#\d+\),\$,#\d+\)/g)).toHaveLength(1);
    expect(again.sheets).toEqual([]); // the sheet is already there and its views have drawings
    expect(text.match(/'SHEET'/g)).toHaveLength(1);
    if (!python) return;
    const file = join(mkdtempSync(join(tmpdir(), 'ifcsheet-bonsai-')), 'again.ifc');
    writeFileSync(file, again.bytes);
    const highest = Math.max(...[...new TextDecoder().decode(first.bytes).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
    const seen = JSON.parse(execFileSync(python, [SCRIPT, file, String(highest)], { encoding: 'utf8', maxBuffer: 1 << 26 })) as {
      new_findings: string[]; drawings: { name: string; group_parents: string[] }[]; sheets: unknown[];
    };
    expect(seen.new_findings).toEqual([]);
    expect(seen.drawings.map((d) => [d.name, d.group_parents])).toEqual([['Ground floor', ['DRAWINGS']], ['Roof floor', ['DRAWINGS']], ['Ground floor B', ['DRAWINGS']]]);
    expect(seen.sheets).toHaveLength(1);
  }, 60_000);

  it('writes nothing for Bonsai when asked not to', async () => {
    const r = await buildAnnotatedIfc({ ...input, bonsai: false });
    const out = added(sourceText, new TextDecoder().decode(r.bytes));
    expect(out).not.toMatch(/'DRAWING'|EPset_Drawing|IFCDOCUMENTINFORMATION/);
    expect(r.sheets).toEqual([]);
  });

  it.skipIf(!python)('lists as two drawings and a sheet by Bonsai\'s own rules, with no schema finding on what was added', async () => {
    const r = await buildAnnotatedIfc(input);
    const file = join(mkdtempSync(join(tmpdir(), 'ifcsheet-bonsai-')), 'fzk.ifc');
    writeFileSync(file, r.bytes);
    const highest = Math.max(...[...sourceText.matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
    const seen = JSON.parse(execFileSync(python as string, [SCRIPT, file, String(highest)], { encoding: 'utf8', maxBuffer: 1 << 26 })) as {
      new_findings: string[];
      drawings: { name: string; target_view: string; scale: string; group: string; group_parents: string[]; grouped: string[]; location: string; document_scope: string; camera: number[]; context: string; resources: Record<string, string | null> }[];
      sheets: { identification: string; name: string; drawings: string[]; project: string[] }[];
      plan_annotations: string[];
    };
    expect(seen.new_findings).toEqual([]);
    expect(seen.drawings.map((d) => [d.name, d.target_view, d.scale, d.group, d.group_parents, d.grouped, d.document_scope, d.context])).toEqual([
      ['Ground floor', 'PLAN_VIEW', '1/100', 'Ground floor', ['DRAWINGS'], ['Ground floor'], 'DRAWING', 'Model'],
      ['Roof floor', 'PLAN_VIEW', '1/50', 'Roof floor', ['DRAWINGS'], ['Roof floor'], 'DRAWING', 'Model'],
    ]);
    // The view's own extent: its annotations (4 m wide, 3.4 m tall) and a metre around them.
    expect(seen.drawings[0].camera.slice(0, 3)).toEqual([6, 5.4, 1.2]);
    // EPset_Drawing, read back by ifcopenshell, names the files Bonsai's svgwriter opens (default.css, markers.svg, ...).
    for (const d of seen.drawings) {
      expect(d.resources).toEqual({ Stylesheet: 'drawings/assets/default.css', Markers: 'drawings/assets/markers.svg', Symbols: 'drawings/assets/symbols.svg', Patterns: 'drawings/assets/patterns.svg', ShadingStyles: 'drawings/assets/shading_styles.json', CurrentShadingStyle: 'Blender Default' });
    }
    expect(seen.sheets).toEqual([expect.objectContaining({ identification: 'A01', name: 'Plans', drawings: ['Ground floor', 'Roof floor'], project: ['IfcProject'] })]);
    expect(seen.plan_annotations).toEqual(['Ground floor', 'Roof floor']);
  }, 60_000);

  it.skipIf(!existsSync(WASM))('reads again in IfcSheet with no camera in the plan and no second annotation (#487)', async () => {
    const [withBonsai, without] = await Promise.all([buildAnnotatedIfc(input), buildAnnotatedIfc({ ...input, bonsai: false })]);
    const [a, b] = await Promise.all([openModel(withBonsai.bytes), openModel(without.bytes)]);
    const drawingIds = new Set(withBonsai.annotations.map((x) => x.drawingExpressId));
    expect(drawingIds.size).toBe(2);
    const meshed = (m: typeof a) => new Set(m.meshes.map((x) => x.expressId));
    expect([...drawingIds].some((id) => meshed(a).has(id as number))).toBe(false);
    expect([...meshed(a)].sort()).toEqual([...meshed(b)].sort());
    const plan = (m: typeof a): PlanProjectView => ({ id: 'p', kind: 'plan', name: 'p', createdAt: 0, level: levelsFromStoreys(m.storeys)[0], cutHeight: 1.2, viewDepth: 0 });
    const lines = async (m: typeof a) => (await generateViewDrawings([plan(m)], m.buildingMeshes, levelsFromStoreys(m.storeys), m.extent!)).get('p')!;
    const [da, db] = [await lines(a), await lines(b)];
    expect(da.lines.length).toBe(db.lines.length);
    expect(da.cutPolygons.length).toBe(db.cutPolygons.length);
    // Each view's annotation once, not once for itself and once for its drawing.
    const text = new TextDecoder().decode(withBonsai.bytes);
    expect(text.match(/'IfcSheet:PlanAnnotations'/g)).toHaveLength(2);
  }, 240_000);
});
