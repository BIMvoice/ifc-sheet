/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifc-lite query --select` (#4094) — the CLI half of the selector adapter.
 * `queryCommand` is wired as `bim.query().select(select).byType(...)...`,
 * reusing the SDK's `QueryBuilder.select()` (itself a thin wrapper over
 * `@ifc-lite/query`'s shared `selectorToQueryDescriptor`) rather than
 * re-parsing selector text in the CLI. These tests prove the flag actually
 * reaches that shared translator end to end — an accepted selector narrows
 * the real result set, and a rejected one exits 1 naming the construct —
 * not just that `QueryBuilder.select()` works in isolation (covered in
 * `packages/sdk`) or that the translator works in isolation (covered in
 * `packages/query`).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryCommand } from './query.js';

function guid(mnemonic: string): string {
  return (mnemonic + '0'.repeat(22)).slice(0, 22);
}

// Wall A: Pset_WallCommon.FireRating = '2HR' and Qto_WallBaseQuantities.NetVolume = 12.5.
// Wall B: Pset_WallCommon.FireRating = '1HR', no quantity set.
// Door C: not a wall at all — the negative control for the type/property narrowing.
const MODEL = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('m','2026',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('${guid('PROJ')}',$,'Proj',$,$,$,$,(#20),#30);
#20= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#21,$);
#21= IFCAXIS2PLACEMENT3D(#22,$,$);
#22= IFCCARTESIANPOINT((0.,0.,0.));
#30= IFCUNITASSIGNMENT((#31));
#31= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#40= IFCLOCALPLACEMENT($,#21);
#41= IFCBUILDINGSTOREY('${guid('STOR')}',$,'L01',$,$,#40,$,$,.ELEMENT.,0.);
#42= IFCBUILDING('${guid('BLDG')}',$,'B',$,$,#40,$,$,.ELEMENT.,$,$,$);
#43= IFCRELAGGREGATES('${guid('AGG1')}',$,$,$,#1,(#42));
#44= IFCRELAGGREGATES('${guid('AGG2')}',$,$,$,#42,(#41));
#45= IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid('RELC')}',$,$,$,(#72,#90,#95),#41);
#72= IFCWALL('${guid('WALA')}',$,'Wall A',$,$,#40,$,'tagA',$);
#81= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('2HR'),$);
#80= IFCPROPERTYSET('${guid('PST1')}',$,'Pset_WallCommon',$,(#81));
#82= IFCRELDEFINESBYPROPERTIES('${guid('RDP1')}',$,$,$,(#72),#80);
#110= IFCQUANTITYVOLUME('NetVolume',$,$,12.5,$);
#111= IFCELEMENTQUANTITY('${guid('QTO1')}',$,'Qto_WallBaseQuantities',$,$,(#110));
#112= IFCRELDEFINESBYPROPERTIES('${guid('RDPQ')}',$,$,$,(#72),#111);
#90= IFCWALL('${guid('WALB')}',$,'Wall B',$,$,#40,$,'tagB',$);
#91= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('1HR'),$);
#92= IFCPROPERTYSET('${guid('PST2')}',$,'Pset_WallCommon',$,(#91));
#93= IFCRELDEFINESBYPROPERTIES('${guid('RDP2')}',$,$,$,(#90),#92);
#95= IFCDOOR('${guid('DOOR')}',$,'Door C',$,$,#40,$,'tagC',$);
ENDSEC;
END-ISO-10303-21;
`;

function captureStdout(): { out: string } {
  const state = { out: '' };
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
    state.out += chunk;
    return true;
  }) as typeof process.stdout.write);
  return state;
}

describe('query --select', () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'query-select-'));
    file = join(dir, 'm.ifc');
    await writeFile(file, MODEL);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('narrows the real result set through the shared translator (class + exact-name Pset comparison)', async () => {
    const stdout = captureStdout();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await queryCommand([file, '--select', 'IfcWall, Pset_WallCommon.FireRating=2HR', '--json']);

    const rows = JSON.parse(stdout.out);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Wall A');
  });

  it('a Qto_ comparison in --select also narrows correctly (quantity-set fallback)', async () => {
    const stdout = captureStdout();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await queryCommand([file, '--select', 'IfcWall, Qto_WallBaseQuantities.NetVolume>1', '--json']);

    const rows = JSON.parse(stdout.out);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Wall A');
  });

  it('ANDs with --type: --select narrows further within the --type-selected set', async () => {
    const stdout = captureStdout();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await queryCommand([file, '--type', 'IfcWall', '--select', 'Pset_WallCommon.FireRating=1HR', '--json']);

    const rows = JSON.parse(stdout.out);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Wall B');
  });

  it('unions a selector class with --type, matching repeated byType semantics', async () => {
    const stdout = captureStdout();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await queryCommand([file, '--type', 'IfcDoor', '--select', 'IfcWall', '--json']);

    const rows = JSON.parse(stdout.out);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row: { type: string }) => row.type))).toEqual(new Set(['IfcWall', 'IfcDoor']));
  });

  it('exits 1 naming the unsupported construct, rather than silently running an empty or partial query', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(
      queryCommand([file, '--select', 'IfcWall, parent=Building', '--json']),
    ).rejects.toThrow();
  });
});
