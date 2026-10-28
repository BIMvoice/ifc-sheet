/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The figures `ifcsheet` writes for people follow the project's "Units and numbers" (#88), as the sheets of the app do: a project file
 * with `separator: 'comma'` (what the Romanian pack sets) makes `boq` and `list` write "299,98", and `build --project` prints its list
 * schedules the same way. The CSV and JSON keep plain numbers (a machine reads them back). On AC20-FZK-Haus.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const LIST = {
  filter: { classes: ['IfcWallStandardCase'] }, groupBy: ['type'], sum: ['area'],
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
};
const ARTICLE = { id: 'a1', code: 'W1', description: 'Walls', unit: 'm2', quantity: 'NetSideArea', factor: 1.5, waste: 5, filter: { classes: ['IfcWallStandardCase'] } };

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
function project(units: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-numbers-'));
  dirs.push(dir);
  const file = join(dir, 'p.ifclite-project.json');
  writeFileSync(file, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'Haus', ...(units ? { unitsAndNumbers: units } : {}), boqArticles: [ARTICLE], schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: LIST }] }));
  return file;
}
async function out(...args: string[]): Promise<string> {
  const text: string[] = [];
  const code = await run(args, { stdout: (t) => void text.push(t), stderr: (t) => void text.push(`ERR ${t}`) });
  expect(code, text.join('')).toBe(0);
  return text.join('');
}
/** A decimal that kept its point, once the file names (the model's path) are taken out. */
const pointDecimals = (text: string): string[] => text.replace(/\S*\.ifc\S*|\S*\.pdf\S*/g, ' ').match(/\d+\.\d+/g) ?? [];

describe.skipIf(missing !== null)('ifcsheet writes the project\'s number format, on AC20-FZK-Haus', () => {
  const comma = project({ separator: 'comma' });
  const plain = project(undefined);

  it('boq: the total and the type rows take the comma', async () => {
    const text = await out('boq', FZK, '--project', comma, '--detail');
    expect(text).toContain('299,98 m²');
    expect(text).toContain('Leichtbeton 102890359 240: 85,35');
    expect(pointDecimals(text)).toEqual([]);
  }, 120_000);

  it('list: the figures of the groups and the total take the comma, rounded to the sheet\'s two decimals', async () => {
    const text = await out('list', FZK, '--project', comma);
    expect(text).toContain('136,28');
    expect(text).toContain('190,47');
    expect(pointDecimals(text)).toEqual([]);
  }, 120_000);

  it('build --project: the list schedules it prints take the comma, and --standard ro sets it without a project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-numbers-'));
    dirs.push(dir);
    expect(pointDecimals(await out('build', FZK, '--project', comma, '--out', join(dir, 'a.pdf')))).toEqual([]);
    const ro = await out('build', FZK, '--project', plain, '--standard', 'ro', '--out', join(dir, 'b.pdf'));
    expect(ro).toContain('190,47');
    expect(pointDecimals(ro)).toEqual([]);
  }, 120_000);

  it('with no setting the language decides: the point in English, the comma with --locale ro', async () => {
    expect(await out('boq', FZK, '--project', plain)).toContain('299.98 m²');
    expect(await out('boq', FZK, '--project', plain, '--locale', 'ro')).toContain('299,98 m²');
    expect(await out('list', FZK, '--project', plain)).toContain('190.47');
  }, 120_000);

  it('a point in a comma language: separator point wins over --locale ro', async () => {
    expect(await out('boq', FZK, '--project', project({ separator: 'point' }), '--locale', 'ro')).toContain('299.98 m²');
  }, 120_000);

  it('CSV and JSON keep the plain numbers, whatever the setting', async () => {
    const json = JSON.parse(await out('boq', FZK, '--project', comma, '--json')) as { articles: { total: number }[] };
    expect(json.articles[0].total).toBeCloseTo(299.98, 2);
    expect(await out('list', FZK, '--project', comma, '--csv')).toContain('136.276074');
  }, 120_000);
});
