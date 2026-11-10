/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #548: the annotated copy of AC20-FZK-Haus from a project with two plans on one sheet is handed over with the SVG of each drawing
 * and of the sheet layout, at the paths the IFC's document references name. Checked on the unpacked ZIP: every referenced path is a
 * file that parses as SVG, and (with a Python that has ifcopenshell) `check-bonsai.py` reads the IFC the way Bonsai does and opens
 * every one of them.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { buildAnnotatedIfc } from '@bimvoice/ifcsheet/annotated-ifc';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { collectAnnotations, type AnnotationSource } from './annotated-ifc-collect';
import { annotatedZip, svgBytes, withSvgs } from './annotated-ifc-svg';

const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
const SCRIPT = fileURLToPath(new URL('../../../../packages/ifcsheet/test-support/check-bonsai.py', import.meta.url));
const GROUND = '2eyxpyOx95m90jmsXLOuR0';
const ROOF = '273g3wqLzDtfYIl7qqkgcO';
const WALL_A = '2XPyKWY018sA1ygZKgQPtU';

const plan = (id: string, name: string, storey: string, elevation: number): ProjectView => ({
  id, name, kind: 'plan', createdAt: 0, scale: 100, cutHeight: 1.2, level: { name, elevation, storeyGlobalIds: [storey] },
});
const layers: DraftLayer[] = [{ id: '0', name: '0', color: '#000', visible: true, locked: false }];
const drafts: DraftEntity[] = ['p0', 'p1'].map((viewId) => ({
  id: `t-${viewId}`, viewId, layerId: '0', shape: { type: 'leader', pts: [{ x: 3, y: -2 }, { x: 4, y: -3 }], text: 'W-1', height: 0.25 }, params: { tagOf: WALL_A, tagField: 'mark' },
}));

const sheet: Pick<ProjectSheet, 'id' | 'name' | 'viewports'> = {
  id: 'sh1',
  name: 'Plans',
  viewports: [
    { id: 'vp0', viewId: 'p0', x: 110, y: 100, scale: 100, width: 200, height: 180, center: { x: 6, y: 3 } },
    { id: 'vp1', viewId: 'p1', x: 310, y: 100, scale: 100, width: 200, height: 180, center: { x: 6, y: 3 } },
  ],
};
const project: AnnotationSource = { views: [plan('p0', 'Ground floor', GROUND, 0), plan('p1', 'Roof floor', ROOF, 2.7)], levels: [], draftLayers: layers, drafts, sheets: [sheet] };

/** What the sheet's SVG export gives: the paper in millimetres, a frame and one text in each viewport. */
const SHEET_SVG = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"><rect x="10" y="10" width="400" height="277" fill="none" stroke="#000"/><text x="20" y="30">Ground</text><text x="230" y="30">Roof</text></svg>`;

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3'].filter((p): p is string => !!p)) {
    try { execFileSync(py, ['-c','import ifcopenshell.validate'], { stdio: 'ignore' }); return py; } catch { /* not this one */ }
  }
  return null;
}
const python = findPython();

async function exported(svgs: Map<string, string>) {
  const source = new Uint8Array(readFileSync(FZK));
  const c = collectAnnotations(project, { x: 0, y: 0 }, 'en');
  const set = withSvgs(c, [sheet], svgs);
  const r = await buildAnnotatedIfc({ source, views: set.views, sheets: set.sheets, marks: c.marks, leftOut: [], fileName: 'Haus annotated.ifc' });
  const support = r.files.map((f) => ({ name: f.path, bytes: svgBytes(f.text) }));
  const entries = unzipSync(annotatedZip([{ name: 'Haus annotated.ifc', bytes: r.bytes }], support));
  return { source, r, entries };
}

describe('the annotated copy of AC20-FZK-Haus with the SVGs of its drawings and sheet (#548)', { skip: !existsSync(FZK) }, () => {
  it('hands over the IFC with one SVG per drawing reference and the layout, each parsing as SVG', async () => {
    const { r, entries } = await exported(new Map([['sh1', SHEET_SVG]]));
    const wanted = ['drawings/Ground floor.svg', 'drawings/Roof floor.svg', 'layouts/A01 - Plans.svg'];
    const referenced = [...new Set([...new TextDecoder().decode(r.bytes).matchAll(/IFCDOCUMENTREFERENCE\('((?:drawings|layouts)\/[^']+\.svg)',[^;]*?'(?:DRAWING|LAYOUT)'/g)].map((m) => m[1]))].sort();
    assert.deepEqual(referenced, wanted);
    assert.deepEqual(Object.keys(entries).sort(), ['Haus annotated.ifc', ...wanted].sort());
    for (const path of wanted) {
      const root = new DOMParser().parseFromString(strFromU8(entries[path]), 'image/svg+xml').documentElement;
      assert.equal(root.localName, 'svg', path);
    }
    // A drawing is the window of the sheet its viewport takes; the layout is the whole sheet.
    assert.match(strFromU8(entries['drawings/Roof floor.svg']), /viewBox="210 10 200 180"/);
    assert.match(strFromU8(entries['layouts/A01 - Plans.svg']), /viewBox="0 0 420 297"/);
  });

  it('a sheet that was not drawn leaves its Locations without files (#548)', async () => {
    const { entries } = await exported(new Map());
    assert.deepEqual(Object.keys(entries), ['Haus annotated.ifc']);
  });

  it('check-bonsai.py opens every referenced file', { skip: python === null }, async () => {
    const { source, entries } = await exported(new Map([['sh1', SHEET_SVG]]));
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-app-svg-'));
    for (const [path, bytes] of Object.entries(entries)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), bytes); }
    const highest = Math.max(...[...new TextDecoder().decode(source).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
    const out = execFileSync(python as string, [SCRIPT,join(dir, 'Haus annotated.ifc'), String(highest), dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const seen = JSON.parse(out) as { new_findings: string[]; svg_problems: string[]; drawings: unknown[]; sheets: unknown[] };
    console.log(`check-bonsai.py: new_findings=${JSON.stringify(seen.new_findings)} svg_problems=${JSON.stringify(seen.svg_problems)} drawings=${seen.drawings.length} sheets=${seen.sheets.length}`);
    assert.deepEqual(seen.new_findings, []);
    assert.deepEqual(seen.svg_problems, []);
    assert.equal(seen.drawings.length, 2);
    assert.equal(seen.sheets.length, 1);
  });
});
