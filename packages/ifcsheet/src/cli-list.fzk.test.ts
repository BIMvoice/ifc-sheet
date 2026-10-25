/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet list` on AC20-FZK-Haus (#78): the walls by type with their count and NetSideArea, run over the engine's headless provider by the
 * steps the app runs. The figures are the ones the app's test pins for the Lists panel on this model (the groups 136.2761 and 54.1895, the
 * total 190.4655); `apps/viewer/src/lib/lists/list-headless-parity.fzk.test.tsx` holds the headless run to the app's, row by row.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { createHeadlessListProvider } from './list-provider.js';
import { listScheduleCsv, listScheduleTableOn, runListScheduleOn } from './list-headless.js';
import type { ListScheduleDef } from './list-schedule.js';
import { openModel, type OpenedModel } from './model.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the list test of the CLI: ${missing}`);

const WALLS_BY_TYPE: ListScheduleDef = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['type'], sum: ['area'],
};
const TYPE = WALLS_BY_TYPE.columns[0];
/** AC20-FZK-Haus with a property set and a quantity set on the type of its eight 300 mm walls ONLY (the fixture's types carry none the Lists engine reads): the Type fallback has something to find. */
function withTypeSets(text: string): string {
  const entities = [
    "#990001= IFCPROPERTYSINGLEVALUE('TypeOnlyRating',$,IFCLABEL('TYPE-R60'),$);",
    "#990002= IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaaa',#12,'Pset_TypeOnly',$,(#990001));",
    "#990003= IFCQUANTITYAREA('TypeOnlyArea',$,$,2.5);",
    "#990004= IFCELEMENTQUANTITY('0bbbbbbbbbbbbbbbbbbbbb',#12,'Qto_TypeOnly',$,$,(#990003));",
  ].join('\n');
  const patched = text.replace("'Leichtbeton 102890359 300',$,$,$,(", "'Leichtbeton 102890359 300',$,$,(#990002,#990004),(").replace(/\nENDSEC;\s*END-ISO-10303-21;\s*$/, `\n${entities}\nENDSEC;\nEND-ISO-10303-21;\n`);
  // Anchor guard for the patch above: a fixture that no longer patches fails loudly rather than vacuously.
  if (patched === text || !patched.includes('#990004')) throw new Error('the fixture could not be patched');
  return patched;
}

const TYPE_ONLY: ListScheduleDef = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [TYPE, { id: 'rating', source: 'property', psetName: 'Pset_TypeOnly', propertyName: 'TypeOnlyRating' }, { id: 'tarea', source: 'quantity', psetName: 'Qto_TypeOnly', propertyName: 'TypeOnlyArea' }],
  groupBy: ['type', 'rating'], sum: ['tarea'],
};

const PROJECT = JSON.stringify({ format: 'ifclite-project', version: 1, name: 'Haus', schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }] });

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const projectFile = (text = PROJECT): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-list-'));
  dirs.push(dir);
  const file = join(dir, 'p.ifclite-project.json');
  writeFileSync(file, text);
  return file;
};

describe.skipIf(missing !== null)('ifcsheet list, on AC20-FZK-Haus', () => {
  let model: OpenedModel;
  beforeAll(async () => { model = await openModel(new Uint8Array(readFileSync(FZK)), { geometry: false }); }, 120_000);

  it('gives the walls by type with the Lists engine\'s counts, areas and total', () => {
    const table = listScheduleTableOn(model, { id: 'walls', name: 'Walls by type', list: WALLS_BY_TYPE }, 'en');
    expect(table.header).toEqual(['Type', 'Count', 'NetSideArea (m²)']);
    expect(table.rows).toHaveLength(3);
    expect(table.bold).toEqual([2]);
    expect(table.rows[2][0]).toBe('Total');
    expect(table.rows[2][1]).toBe(13);
    expect(table.rows[2][2] as number).toBeCloseTo(190.4655, 4);
    expect(table.rows.slice(0, 2).map((r) => Number((r[2] as number).toFixed(4))).sort((a, b) => b - a)).toEqual([136.2761, 54.1895]);
    expect(table.rows.slice(0, 2).map((r) => r[1]).sort()).toEqual([5, 8]);
    expect((table.rows[0][2] as number) + (table.rows[1][2] as number)).toBeCloseTo(190.4655, 4);
  });

  it('reads the type\'s own properties and names through the provider, as the app\'s provider does', () => {
    const provider = createHeadlessListProvider(model.dataStore, 'AC20-FZK-Haus.ifc');
    const walls = provider.getEntitiesByType(5 as never);
    expect(Array.isArray(walls)).toBe(true);
    expect(provider.getModelName?.()).toBe('AC20-FZK-Haus.ifc');
    const run1 = runListScheduleOn(model, { id: 'w', name: 'Walls', list: { filter: { classes: ['IfcWallStandardCase'] }, columns: [{ id: 'name', source: 'attribute', propertyName: 'Name' }, { id: 'storey', source: 'spatial', propertyName: 'Storey' }, { id: 'type', source: 'attribute', propertyName: 'Type' }] } });
    expect(run1.result.rows).toHaveLength(13);
    expect(run1.grouped).toBe(false);
    for (const row of run1.result.rows) expect(String(row.values[2])).toMatch(/^Leichtbeton/);
  });

  it('reads what the type defines once (the Type fallback of the provider): a property and a quantity only on the type of the 300 mm walls', async () => {
    const patched = await openModel(new TextEncoder().encode(withTypeSets(readFileSync(FZK, 'utf8'))), { geometry: false });
    const table = listScheduleTableOn(patched, { id: 't', name: 'Type only', list: TYPE_ONLY }, 'en');
    expect(table.header).toEqual(['Type', 'TypeOnlyRating', 'Count', 'TypeOnlyArea (m²)']);
    const row = table.rows.find((r) => r[1] === 'TYPE-R60');
    expect(row).toBeDefined();
    expect(row!.slice(2)).toEqual([8, 20]);
  });

  it('writes the CSV of the app (BOM, CRLF, plain figures); Romanian takes ; and its words', () => {
    const en = listScheduleCsv(listScheduleTableOn(model, { id: 'walls', name: 'W', list: WALLS_BY_TYPE }, 'en'), 'en');
    expect(en.startsWith('﻿Type,Count,NetSideArea (m²)\r\n')).toBe(true);
    expect(en.endsWith('\r\n')).toBe(true);
    expect(en).toMatch(/\r\nTotal,13,190\.4655\d*\r\n$/);
    const ro = listScheduleCsv(listScheduleTableOn(model, { id: 'walls', name: 'W', list: WALLS_BY_TYPE }, 'ro'), 'ro');
    expect(ro.startsWith('﻿Type;Număr;NetSideArea (m²)\r\n')).toBe(true);
    expect(ro).toMatch(/\r\nTotal;13;190\.4655\d*\r\n$/);
  });

  it('guards a cell that would run as a formula with the one escaper', () => {
    const table = listScheduleTableOn(model, { id: 'x', name: 'X', list: { filter: { classes: ['IfcWallStandardCase'] }, columns: [{ id: 'g', source: 'attribute', propertyName: 'GlobalId' }] } }, 'en');
    table.rows[0][0] = '=HYPERLINK("http://x","y")';
    expect(listScheduleCsv(table, 'en')).toContain("'=HYPERLINK");
  });

  it('prints the table on the command line, as CSV, as JSON, and by --schedule name or id', async () => {
    const file = projectFile();
    const text = capture();
    expect(await run(['list', FZK, '--project', file], text.io)).toBe(EXIT.ok);
    expect(text.out()).toMatch(/^Walls by type\nType\s+Count\s+NetSideArea \(m²\)\n/);
    expect(text.out()).toMatch(/Total\s+13\s+190\.4655/);
    const csv = capture();
    expect(await run(['list', FZK, '--project', file, '--schedule', 'walls', '--csv'], csv.io)).toBe(EXIT.ok);
    expect(csv.out()).toBe(listScheduleCsv(listScheduleTableOn(model, { id: 'walls', name: 'Walls by type', list: WALLS_BY_TYPE }, 'en'), 'en'));
    const json = capture();
    expect(await run(['list', FZK, '--project', file, '--schedule', 'Walls by type', '--json'], json.io)).toBe(EXIT.ok);
    const parsed = JSON.parse(json.out());
    expect(parsed.header).toEqual(['Type', 'Count', 'NetSideArea (m²)']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.totals[1]).toBe(13);
    expect(parsed.totals[2]).toBeCloseTo(190.4655, 4);
  }, 120_000);

  it('prints the project\'s list schedules after ifcsheet build --project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-list-build-'));
    dirs.push(dir);
    const c = capture();
    expect(await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--project', projectFile()], c.io)).toBe(EXIT.ok);
    expect(c.out()).toMatch(/Walls by type\nType\s+Count/);
    expect(c.out()).toMatch(/Total\s+13\s+190\.4655/);
  }, 300_000);

  it('fails with a reason: no list schedule, an unknown one, a missing file, a class the model lacks', async () => {
    const none = capture();
    expect(await run(['list', FZK, '--project', projectFile(JSON.stringify({ format: 'ifclite-project', version: 1 }))], none.io)).toBe(EXIT.failed);
    expect(none.err()).toMatch(/holds no list schedules/);
    const unknown = capture();
    expect(await run(['list', FZK, '--project', projectFile(), '--schedule', 'nope'], unknown.io)).toBe(EXIT.failed);
    expect(unknown.err()).toMatch(/no list schedule "nope": walls \(Walls by type\)/);
    const gone = capture();
    expect(await run(['list', FZK, '--project', '/no/such/file.json'], gone.io)).toBe(EXIT.failed);
    expect(gone.err()).toMatch(/no such file/);
    const empty = capture();
    const noClass = JSON.stringify({ format: 'ifclite-project', version: 1, schedules: [{ id: 'a', name: 'A', kind: 'list', createdAt: 1, list: { ...WALLS_BY_TYPE, filter: { classes: ['IfcNoSuchThing'] } } }] });
    expect(await run(['list', FZK, '--project', projectFile(noClass)], empty.io)).toBe(EXIT.failed);
    expect(empty.err()).toMatch(/nothing to list/);
    const usage = capture();
    expect(await run(['list', FZK], usage.io)).toBe(EXIT.usage);
    expect(await run(['boq', FZK, '--project', projectFile(), '--schedule', 'x'], capture().io)).toBe(EXIT.usage);
  }, 120_000);
});
