/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The framing rule (#268) on real models, read through `openModel`. Every
 * "unchanged" extent is measured here from the mesh vertices with a plain
 * loop, not through the framing helper, so the helper cannot agree with itself.
 *
 * AC20-FZK-Haus and bloc-p4 are in the repository. The Ara3D samples (Skolebygg,
 * Duplex, Schependomlaan) are read from the ifc-lite checkout when it is there
 * (`IFC_LITE_MODELS`, default `~/dev/ifclite/tests/models`) and skipped when not.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MeshData } from '@ifc-lite/geometry';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { openModel, readinessOfModel, type OpenedModel } from './headless.js';
import { describeReadiness } from './readiness.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const ARA3D = join(process.env.IFC_LITE_MODELS ?? join(homedir(), 'dev/ifclite/tests/models'), 'ara3d');
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const noWasm = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

/** FZK-Haus with a 0.6 x 0.8 x 1 m survey cube (a marker is small by the 13 m house) `west` metres out, contained in its storey, as the Skolebygg sample has one. */
function withFarMarker(source: string, west: number): string {
  const rows = [
    `#900001= IFCCARTESIANPOINT((${-west}.,0.,0.));`,
    '#900002= IFCAXIS2PLACEMENT3D(#900001,$,$);',
    '#900003= IFCLOCALPLACEMENT(#477,#900002);',
    '#900004= IFCCARTESIANPOINT((0.3,0.4));',
    '#900005= IFCAXIS2PLACEMENT2D(#900004,$);',
    '#900006= IFCRECTANGLEPROFILEDEF(.AREA.,$,#900005,0.6,0.8);',
    '#900007= IFCEXTRUDEDAREASOLID(#900006,#900008,#900009,1.);',
    '#900008= IFCAXIS2PLACEMENT3D(#900010,$,$);',
    '#900009= IFCDIRECTION((0.,0.,1.));',
    '#900010= IFCCARTESIANPOINT((0.,0.,0.));',
    '#900011= IFCSHAPEREPRESENTATION(#118,\'Body\',\'SweptSolid\',(#900007));',
    '#900012= IFCPRODUCTDEFINITIONSHAPE($,$,(#900011));',
    '#900013= IFCBUILDINGELEMENTPROXY(\'1cHGmPSXzFhOqVxhbE1HnR\',#12,\'NUS - 0,0 - Kake\',$,$,#900003,#900012,$,$);',
    '#900014= IFCRELCONTAINEDINSPATIALSTRUCTURE(\'2cHGmPSXzFhOqVxhbE1HnR\',#12,$,$,(#900013),#479);',
  ];
  const end = source.lastIndexOf('ENDSEC;');
  return `${source.slice(0, end)}${rows.join('\n')}\n${source.slice(end)}`;
}

interface Box { min: [number, number, number]; max: [number, number, number] }

/** The box of the vertices of `meshes`, by a plain loop. */
function vertexBox(meshes: readonly MeshData[]): Box {
  const box: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const mesh of meshes) {
    const o = mesh.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = mesh.positions[i + k] + o[k];
        if (v < box.min[k]) box.min[k] = v;
        if (v > box.max[k]) box.max[k] = v;
      }
    }
  }
  return box;
}

const boxOf = (e: NonNullable<OpenedModel['extent']>): Box => ({ min: [e.min.x, e.min.y, e.min.z], max: [e.max.x, e.max.y, e.max.z] });

function expectBox(actual: Box, wanted: Box): void {
  for (let k = 0; k < 3; k++) {
    expect(actual.min[k]).toBeCloseTo(wanted.min[k], 6);
    expect(actual.max[k]).toBeCloseTo(wanted.max[k], 6);
  }
}

const open = (path: string, options = {}): Promise<OpenedModel> => openModel(new Uint8Array(readFileSync(path)), options);

describe.skipIf(noWasm !== null || !existsSync(FZK))('AC20-FZK-Haus, with and without a survey marker 80 m west', () => {
  let plain: OpenedModel;
  let marked: OpenedModel;
  let markedAll: OpenedModel;
  const source = existsSync(FZK) ? readFileSync(FZK, 'utf8') : '';

  beforeAll(async () => {
    plain = await open(FZK);
    marked = await openModel(new TextEncoder().encode(withFarMarker(source, 80)));
    markedAll = await openModel(new TextEncoder().encode(withFarMarker(source, 80)), { includeFarElements: true });
  }, 300_000);

  it('frames the plain model on exactly the box of its vertices: nothing is left out', () => {
    expect(plain.farElements).toEqual([]);
    expectBox(boxOf(plain.extent!), vertexBox(plain.buildingMeshes));
  });

  it('leaves the marker out and frames the marked model exactly as the plain one', () => {
    expect(marked.farElements.map((f) => f.label)).toEqual(['NUS - 0,0 - Kake']);
    expect(marked.farElements[0].distance).toBeGreaterThan(75);
    expectBox(boxOf(marked.extent!), boxOf(plain.extent!));
  });

  it('keeps the marker in the model: its meshes are still there to draw and to schedule', () => {
    const id = marked.farElements[0].expressId;
    expect(marked.meshes.some((m) => m.expressId === id)).toBe(true);
    expect(marked.buildingMeshes.some((m) => m.expressId === id)).toBe(true);
  });

  it('frames on everything again with the project setting, to the vertex box of all the building\'s meshes', () => {
    expect(markedAll.farElements).toEqual([]);
    expect(markedAll.includeFarElements).toBe(true);
    expectBox(boxOf(markedAll.extent!), vertexBox(markedAll.buildingMeshes));
    expect(markedAll.extent!.max.x - markedAll.extent!.min.x).toBeGreaterThan(90);
    expect(generateDefaultSet(markedAll)!.document.includeFarElements).toBe(true);
    expect(generateDefaultSet(marked)!.document.includeFarElements).toBeUndefined();
  });

  it('lays the marked model out on the same scales as the plain one, and the setting back on the old scales', () => {
    const scales = (set: DefaultSet) => set.document.views.map((v) => [v.kind, v.name, v.scale]);
    const set = (m: OpenedModel) => generateDefaultSet(m, { now: Date.UTC(2026, 9, 24) })!;
    expect(scales(set(marked))).toEqual(scales(set(plain)));
    expect(scales(set(markedAll))).not.toEqual(scales(set(plain)));
  });

  it('says so in the readiness, naming the element and its distance', () => {
    const [finding] = readinessOfModel(marked).filter((f) => f.kind === 'farElements');
    expect(finding.params.count).toBe(1);
    expect(String(finding.params.list)).toMatch(/^'NUS - 0,0 - Kake' \(\d+ m\)$/);
    const text = describeReadiness(finding);
    expect(text.missing).toMatch(/^1 elements lie up to \d+ m from the building: 'NUS - 0,0 - Kake' \(\d+ m\)\.$/);
    expect(text.effect).toContain('framed without them');
    expect(readinessOfModel(markedAll).some((f) => f.kind === 'farElements')).toBe(false);
    expect(readinessOfModel(plain).some((f) => f.kind === 'farElements')).toBe(false);
  });
});

describe.skipIf(noWasm !== null || !existsSync(FZK))('ifcsheet check, on the FZK-Haus with a survey marker', () => {
  const file = (): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'ifcsheet-far-')), 'marked.ifc');
    writeFileSync(path, withFarMarker(readFileSync(FZK, 'utf8'), 80));
    return path;
  };
  const check = async (...args: string[]) => {
    const out: string[] = [];
    const code = await run(['check', ...args, '--json'], { stdout: (t) => void out.push(t), stderr: () => {} });
    return { code, report: JSON.parse(out.join('')) as { findings: { kind: string; missing: string; effect: string }[] } };
  };

  it('names the marker and its distance, and the setting is offered on the command line', async () => {
    const { code, report } = await check(file());
    expect(code).toBe(EXIT.failed);
    const far = report.findings.find((f) => f.kind === 'farElements');
    expect(far?.missing).toMatch(/^1 elements lie up to \d+ m from the building: 'NUS - 0,0 - Kake' \(\d+ m\)\.$/);
    expect(far?.effect).toContain('--include-far-elements');
  }, 300_000);

  it('says nothing about it when the saved project (--project) has the setting on', async () => {
    const project = join(mkdtempSync(join(tmpdir(), 'ifcsheet-far-')), 'p.ifclite-project.json');
    writeFileSync(project, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'Marked', includeFarElements: true }));
    const { report } = await check(file(), '--project', project);
    expect(report.findings.some((f) => f.kind === 'farElements')).toBe(false);
    writeFileSync(project, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'Marked' }));
    expect((await check(file(), '--project', project)).report.findings.some((f) => f.kind === 'farElements')).toBe(true);
  }, 300_000);

  it('says nothing about it with --include-far-elements', async () => {
    const { report } = await check(file(), '--include-far-elements');
    expect(report.findings.some((f) => f.kind === 'farElements')).toBe(false);
  }, 300_000);
});

describe.skipIf(noWasm !== null || !existsSync(BLOC))('bloc-p4', () => {
  it('is framed on exactly the box of its vertices', async () => {
    const model = await open(BLOC);
    expect(model.farElements).toEqual([]);
    expectBox(boxOf(model.extent!), vertexBox(model.buildingMeshes));
  }, 300_000);
});

const SKOLEBYGG = join(ARA3D, 'ISSUE_068_ARK_NUS_skolebygg.ifc');
describe.skipIf(noWasm !== null || !existsSync(SKOLEBYGG))('Skolebygg', () => {
  let model: OpenedModel;
  let all: OpenedModel;

  beforeAll(async () => {
    model = await open(SKOLEBYGG);
    all = await open(SKOLEBYGG, { includeFarElements: true });
  }, 600_000);

  it('leaves out the survey cube "NUS - 0,0 - Kake" and nothing else', () => {
    expect(model.farElements).toHaveLength(1);
    expect(model.farElements[0].label).toMatch(/^NUS - 0,0 - Kake/);
    expect(model.dataStore.entities.getGlobalId(model.farElements[0].expressId)).toBe('1cHGmPSXzFhOqVxhbE1HnR');
    expect(model.farElements[0].distance).toBeGreaterThan(100);
  });

  it('frames the building of about 90 x 84 m, not 200 x 206 m', () => {
    const e = model.extent!;
    expect(e.min.x).toBeCloseTo(108.2, 1);
    expect(e.max.x).toBeCloseTo(198.5, 1);
    expect(e.min.z).toBeCloseTo(-206.3, 1);
    expect(e.max.z).toBeCloseTo(-121.9, 1);
    const old = all.extent!;
    expect(old.min.x).toBeCloseTo(-1.7, 1);
    expect(old.max.z).toBeCloseTo(0, 1);
    expectBox(boxOf(old), vertexBox(all.buildingMeshes));
  });

  it('keeps 1:200 on A0, which is what a 90 x 84 m building needs, and the groups now fit the paper', () => {
    const set = generateDefaultSet(model)!;
    const before = generateDefaultSet(all)!;
    const scales = (d: DefaultSet) => [...new Set(d.document.sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.scale)))];
    expect(scales(set)).toEqual([200]);
    expect(scales(before)).toEqual([200]);
    expect(set.notes.filter((n) => n.key === 'draftSet.note.noFit')).toEqual([]);
    expect(before.notes.filter((n) => n.key === 'draftSet.note.noFit').map((n) => n.params.kind)).toEqual(['plans', 'elevations', 'sections']);
    expect(set.document.sheets.filter((s) => s.number === 'A-101' || s.number === 'A-102').map((s) => [s.paper, s.viewports?.length])).toEqual([['A0', 2], ['A0', 2]]);
  });

  it('is named in the readiness', () => {
    const [finding] = readinessOfModel(model).filter((f) => f.kind === 'farElements');
    expect(String(finding.params.list)).toMatch(/^'NUS - 0,0 - Kake[^']*' \(1\d\d m\)$/);
  });
});

describe.skipIf(noWasm !== null)('the other Ara3D samples', () => {
  for (const file of ['duplex.ifc', 'schependomlaan.ifc']) {
    const path = join(ARA3D, file);
    it.skipIf(!existsSync(path))(`${file} is framed on exactly the box of its vertices`, async () => {
      const model = await open(path);
      expect(model.farElements).toEqual([]);
      expectBox(boxOf(model.extent!), vertexBox(model.buildingMeshes));
    }, 600_000);
  }
});
