/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #548, elevations and sections: AC20-FZK-Haus exported with a plan, an empty plan, an elevation and a section, read the way Bonsai
 * reads them. The camera of each is the view's own crop (not its annotations' bounds), placed as `generate_drawing_matrix` places
 * it: looking along the view's direction, up the world's Z. Where a Python with `ifcopenshell` is on the machine,
 * `test-support/check-bonsai.py` lists the drawings by Bonsai's rules.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAnnotatedIfc, type AnnotatedIfcInput, type AnnotatedView } from './annotated-ifc.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../test-support/check-bonsai.py', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
const GROUND = '2eyxpyOx95m90jmsXLOuR0';

function findPython(): string | null {
  for (const py of [process.env.IFCSHEET_PYTHON, 'python3.11', 'python3', 'python'].filter((p): p is string => !!p)) {
    try { execFileSync(py, ['-c', 'import ifcopenshell.validate'], { stdio: 'ignore' }); return py; } catch { /* not this one */ }
  }
  return null;
}
const python = findPython();

const plan: AnnotatedView = {
  viewId: 'v-plan', name: 'Ground floor', scale: 100, storeyGlobalIds: [GROUND],
  extent: { min: { x: 0, y: 0 }, max: { x: 12, y: 10 } },
  curves: [{ type: 'polyline', points: [{ x: 2, y: 3 }, { x: 3, y: 4 }] }], texts: [],
};
const emptyPlan: AnnotatedView = { viewId: 'v-empty', name: 'Empty plan', scale: 100, storeyGlobalIds: [GROUND], extent: { min: { x: -1, y: -1 }, max: { x: 5, y: 3 } }, curves: [], texts: [] };
const elevation: AnnotatedView = {
  viewId: 'v-south', name: 'South elevation', scale: 100, storeyGlobalIds: [GROUND], targetView: 'ELEVATION_VIEW',
  vertical: { look: { x: 0, y: 1 }, centre: { x: 6, y: -2, z: 3 }, width: 14, height: 8, depth: 15 },
  curves: [], texts: [],
};
const section: AnnotatedView = {
  viewId: 'v-sec', name: 'Section A', scale: 50, storeyGlobalIds: [GROUND], targetView: 'SECTION_VIEW',
  vertical: { look: { x: 1, y: 0 }, centre: { x: 6, y: 5, z: 2 }, width: 12, height: 7, depth: 6 },
  curves: [], texts: [],
};

interface Seen {
  new_findings: string[];
  drawings: { name: string; target_view: string; group_parents: string[]; camera: [number, number, number, number[]]; camera_frame: { location: number[]; x: number[]; y: number[]; z: number[] } }[];
}

const run = (bytes: Uint8Array, highest: number): Seen => {
  const file = join(mkdtempSync(join(tmpdir(), 'ifcsheet-bonsai-')), 'fzk.ifc');
  writeFileSync(file, bytes);
  return JSON.parse(execFileSync(python as string, [SCRIPT, file, String(highest)], { encoding: 'utf8', maxBuffer: 1 << 26 })) as Seen;
};

describe.skipIf(missing !== null)('AC20-FZK-Haus plan, elevation and section as Bonsai drawings (#548)', () => {
  const source = new Uint8Array(readFileSync(FZK));
  const highest = Math.max(...[...new TextDecoder().decode(source).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1])));
  const input: AnnotatedIfcInput = { source, views: [plan, emptyPlan, elevation, section], sheets: [{ name: 'Views', identification: 'A01', viewIds: ['v-plan', 'v-south', 'v-sec'] }] };

  it('writes a drawing for each view, with its own TargetView; an elevation and a section carry no annotation', async () => {
    const r = await buildAnnotatedIfc(input);
    const out = new TextDecoder().decode(r.bytes);
    expect(r.drawings.map((d) => [d.name, d.targetView])).toEqual([['Ground floor', 'PLAN_VIEW'], ['Empty plan', 'PLAN_VIEW'], ['South elevation', 'ELEVATION_VIEW'], ['Section A', 'SECTION_VIEW']]);
    expect(r.annotations.map((a) => a.name)).toEqual(['Ground floor']);
    expect(out.match(/IFCPROPERTYSINGLEVALUE\('TargetView',\$,IFCLABEL\('PLAN_VIEW'\),\$\)/g)).toHaveLength(2);
    expect(out.match(/IFCPROPERTYSINGLEVALUE\('TargetView',\$,IFCLABEL\('ELEVATION_VIEW'\),\$\)/g)).toHaveLength(1);
    expect(out.match(/IFCPROPERTYSINGLEVALUE\('TargetView',\$,IFCLABEL\('SECTION_VIEW'\),\$\)/g)).toHaveLength(1);
    expect(out.match(/'IfcSheet:PlanAnnotations'/g)).toHaveLength(1);
    expect(r.sheets[0].viewIds).toEqual(['v-plan', 'v-south', 'v-sec']);
  });

  it('an elevation or section without a crop is not written as a drawing', async () => {
    const r = await buildAnnotatedIfc({ source, views: [{ ...elevation, vertical: undefined }] });
    expect(r.drawings).toEqual([]);
    expect(r.notes).toEqual([{ key: 'viewEmpty', params: { view: 'South elevation' } }]);
  });

  it.skipIf(!python)('Bonsai lists them with cameras that match the crop, and a re-export adds no parent and no duplicate', async () => {
    const r = await buildAnnotatedIfc(input);
    const seen = run(r.bytes, highest);
    expect(seen.new_findings).toEqual([]);
    expect(seen.drawings.map((d) => [d.name, d.target_view, d.group_parents])).toEqual([
      ['Ground floor', 'PLAN_VIEW', ['DRAWINGS']], ['Empty plan', 'PLAN_VIEW', ['DRAWINGS']],
      ['South elevation', 'ELEVATION_VIEW', ['DRAWINGS']], ['Section A', 'SECTION_VIEW', ['DRAWINGS']],
    ]);
    const [p, e, , s] = [seen.drawings[0], seen.drawings[2], seen.drawings[1], seen.drawings[3]];
    // The crop, not the annotations' bounds: 12 x 10 for the plan, 14 x 8 for the elevation, 12 x 7 for the section.
    expect(p.camera.slice(0, 3)).toEqual([12, 10, 1.2]);
    expect(seen.drawings[1].camera.slice(0, 3)).toEqual([6, 4, 1.2]);
    expect(e.camera.slice(0, 3)).toEqual([14, 8, 15]);
    expect(s.camera.slice(0, 3)).toEqual([12, 7, 6]);
    // Bonsai's matrix for a camera looking along `look` with Z up: local -Z is `look`, local Y is world Z, local X is `look` x Z.
    expect(e.camera_frame.z).toEqual([0, -1, 0]);
    expect(e.camera_frame.x).toEqual([1, 0, 0]);
    expect(e.camera_frame.y).toEqual([0, 0, 1]);
    expect(s.camera_frame.z).toEqual([-1, 0, 0]);
    expect(s.camera_frame.x).toEqual([0, -1, 0]);
    expect(s.camera_frame.y).toEqual([0, 0, 1]);
    expect(e.camera_frame.location.slice(0, 2)).toEqual([6, -2]);
    expect(s.camera_frame.location.slice(0, 2)).toEqual([6, 5]);
    // The elevation's camera sits 3 m, the section's 2 m, above the storey's own origin (the plan's, its cut height of 1.2).
    expect(e.camera_frame.location[2] - p.camera_frame.location[2]).toBeCloseTo(3 - 1.2, 3);
    expect(s.camera_frame.location[2] - p.camera_frame.location[2]).toBeCloseTo(2 - 1.2, 3);

    const again = await buildAnnotatedIfc({ source: r.bytes, views: [...input.views, { ...section, viewId: 'v-sec2', name: 'Section B' }] });
    const text = new TextDecoder().decode(again.bytes);
    expect(again.drawings.map((d) => d.name)).toEqual(['Section B']);
    expect(text.match(/IFCGROUP\('[^']+',#12,'DRAWINGS',\$,'DRAWINGS'\)/g)).toHaveLength(1);
    expect(text.match(/IFCDOCUMENTINFORMATION\('DRAWINGS',/g)).toHaveLength(1);
    const reread = run(again.bytes, Math.max(...[...new TextDecoder().decode(r.bytes).matchAll(/^#(\d+)\s*=/gm)].map((m) => Number(m[1]))));
    expect(reread.new_findings).toEqual([]);
    expect(reread.drawings.map((d) => d.name)).toEqual(['Ground floor', 'Empty plan', 'South elevation', 'Section A', 'Section B']);
    expect(new Set(reread.drawings.map((d) => d.name)).size).toBe(5);
  }, 90_000);
});
