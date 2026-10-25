/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build model.ifc --template office.bvset` (#21): the headless build runs the same rule code the app does. */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { generateDefaultSet, parseSetTemplate, serializeSetTemplate, type SetTemplate } from './index.js';
import { openModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const pdfPages = (bytes: Buffer): number => (bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dirs: string[] = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-set-template-')); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** An office's template written by hand: four storeys of plans on A1 at 1:200, then the sections; FZK-Haus has two storeys. */
const OFFICE: SetTemplate = {
  name: 'Office', annotations: {}, schedules: [],
  sheets: [
    { name: 'Office plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [0, 1, 2, 3].map((storey) => ({ view: { kind: 'plan' as const, storey }, scale: 200 })) },
    { name: 'Sections', series: 'sections', layout: { paper: 'A2', orientation: 'landscape' }, slots: [{ view: { kind: 'section' as const, place: 0 }, scale: 200 }] },
  ],
};

describe.skipIf(missing !== null)('ifcsheet build --template, on AC20-FZK-Haus', () => {
  it('builds the sheets the rules make, the same ones the engine lays out, and says what it skipped', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'office.bvset'), serializeSetTemplate(OFFICE));
    const c = capture();
    const code = await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--dxf', join(dir, 'dxf'), '--template', join(dir, 'office.bvset')], c.io);
    expect(c.err()).toBe('');
    expect(code).toBe(EXIT.ok);
    // The same set as the engine's own call with the same template (a plan per storey: two exist; two rules find nothing).
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { setTemplate: parseSetTemplate(readFileSync(join(dir, 'office.bvset'), 'utf8')) })!;
    const numbers = made.document.sheets.map((s) => s.number);
    expect(numbers).toEqual(['A-101', 'A-301', 'A-302']);
    expect(readdirSync(join(dir, 'dxf')).sort()).toEqual(numbers.map((n) => `${n}.dxf`).sort());
    expect(pdfPages(readFileSync(join(dir, 'set.pdf')))).toBe(numbers.length);
    expect(c.out()).toContain('Skipped on Office plans: the template has a plan for storey +2 (0 is the ground storey)');
    expect(c.out()).toContain('storey +3');
    // The template has no elevations sheet: the four are left off the sheets and named, and Section B-B takes the sections sheet's paper.
    expect(c.out()).toContain('left off the sheets');
  }, 300_000);

  it('refuses a template it cannot read, naming the place, and writes nothing', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'bad.bvset'), JSON.stringify({ ...JSON.parse(serializeSetTemplate(OFFICE)), sheets: [{ name: 'X', series: 'plans', layout: { paper: 'A1' }, slots: [{ view: { kind: 'plan', storey: 'one' } }] }] }));
    const c = capture();
    expect(await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--template', join(dir, 'bad.bvset')], c.io)).toBe(EXIT.failed);
    expect(c.err()).toContain('/sheets/0/slots/0/view/storey');
    expect(existsSync(join(dir, 'set.pdf'))).toBe(false);
    const missingFile = capture();
    expect(await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--template', join(dir, 'nope.bvset')], missingFile.io)).toBe(EXIT.failed);
    expect(missingFile.err()).toContain('no such file');
  });

  it('is an option of build only', async () => {
    const c = capture();
    expect(await run(['check', FZK, '--template', 'x.bvset'], c.io)).toBe(EXIT.usage);
  });
});
