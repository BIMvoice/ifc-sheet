/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #411 on bloc-p4, the model of the report: its 506 IfcWall declare no NetSideArea. `ifcsheet list` and `ifcsheet boq` must both print a
 * dash for it, never the 0 the list used to print.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from './cli.js';
import { newArticle } from './boq.js';

const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const skip = !existsSync(BLOC) || !existsSync(WASM);

const LIST = {
  filter: { classes: ['IfcWall'] },
  columns: [{ id: 'cls', source: 'attribute', propertyName: 'Class' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['cls'], sum: ['area'],
};
const ARTICLE = { ...newArticle('w', 'm2'), code: 'W1', description: 'Zidarie perete', quantity: 'NetSideArea', filter: { classes: ['IfcWall'] } };

const dir = skip ? '' : mkdtempSync(join(tmpdir(), 'ifcsheet-411-'));
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
const capture = () => { const out: string[] = []; return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void out.push(t) }, out: () => out.join('') }; };

describe.skipIf(skip)('a missing quantity on bloc-p4', () => {
  const project = () => {
    const file = join(dir, 'p.ifclite-project.json');
    writeFileSync(file, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'p', boqArticles: [ARTICLE], schedules: [{ id: 'l', name: 'Walls', kind: 'list', createdAt: 1, list: LIST }] }));
    return file;
  };

  it('prints a dash for the NetSideArea of 506 walls in the list, group and total, and in the bill of quantities', async () => {
    const list = capture();
    expect(await run(['list', BLOC, '--project', project()], list.io)).toBe(0);
    expect(list.out()).toMatch(/506\s+–\n/);
    expect(list.out()).toMatch(/Total\s+506\s+–\n/);
    // All 506 rows lack it: the total is a dash and the line under the table says how many rows it leaves out (#432).
    expect(list.out()).toMatch(/leaves out 506 of 506 rows with no value\n$/);
    expect(list.out()).not.toMatch(/506\s+0\n/);
    const boq = capture();
    expect(await run(['boq', BLOC, '--project', project(), '--detail'], boq.io)).toBe(0);
    expect(boq.out()).toMatch(/Zidarie perete\b.*–/);
  }, 180_000);
});
