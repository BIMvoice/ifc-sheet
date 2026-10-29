/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text `rooms`, `boq`, `materials`, `classify`, `list` and `check` print is in the language the run resolved (#405): the
 * project's, else `--locale`, else English. On AC20-FZK-Haus: Romanian lines are asserted literally and no English word is
 * left; English is the text of before, byte for byte.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the language test of the CLI text: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'cli-text-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ARTICLE = { id: 'd', code: 'EXAMPLE-D', description: 'EXAMPLE: doors', unit: 'm3', quantity: 'NetVolume', filter: { classes: ['IfcDoor'] }, factor: 1, waste: 0 };
const MAPPING = { id: 'ex', system: { name: 'Uniclass', edition: '2015' }, rules: [{ by: 'class', match: 'IfcDoor', code: 'EXAMPLE-Ss_32', title: 'EXAMPLE: doors' }] };
const LIST = { filter: { classes: ['IfcWallStandardCase'] }, columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }], groupBy: ['type'], sum: ['area'] };
const project = (name: string, language?: string): string => {
  const file = join(dir, `${name}.ifclite-project.json`);
  writeFileSync(file, JSON.stringify({ format: 'ifclite-project', version: 1, name, ...(language ? { language } : {}), boqArticles: [ARTICLE], classificationMappings: [MAPPING], schedules: [{ id: 'walls', name: 'Walls', kind: 'list', createdAt: 1, list: LIST }] }));
  return file;
};

async function text(argv: string[]): Promise<{ out: string; err: string; code: number }> {
  let out = '';
  let err = '';
  const code = await run(argv, { stdout: (t) => { out += t; }, stderr: (t) => { err += t; } });
  return { out, err, code };
}

/** English words of the closing lines and notes; none may be left in a Romanian run. */
const ENGLISH = /\b(rooms?|areas?|left out|external|split|elements?|lack|quantity|article|takes|none|hatch|fill|guessed|thing|membrane|materials|have no code|no type|the model|storeys|drawing set)\b/i;

describe.skipIf(missing !== null)('the text of the commands, in the resolved language', () => {
  const ro = project('ro', 'ro');
  const plain = project('plain');

  it('rooms: the closing line is Romanian under --locale ro and under a Romanian project, English otherwise', async () => {
    const line = '7 încăperi; arii: 7 din cantitatea modelului, 0 din geometrie. Excluse: 0 exterioare, 0 din schema de arii (GFA), 0 împărțite în încăperi proprii.';
    for (const argv of [['rooms', FZK, '--locale', 'ro'], ['rooms', FZK, '--project', ro]]) {
      const r = await text(argv);
      expect(r.code).toBe(EXIT.ok);
      expect(r.out).toContain(`\n${line}\n`);
      expect(r.out.split('\n').filter((l) => ENGLISH.test(l) && !/^\d+\s/.test(l))).toEqual([]);
    }
    const en = await text(['rooms', FZK]);
    expect(en.out).toContain('\n7 rooms; areas from 7 model quantity, 0 geometry. Left out: 0 external, 0 area-scheme (GFA), 0 split into rooms of their own.\n');
  });

  it('boq: the missing-quantity line is Romanian, English unchanged', async () => {
    const r = await text(['boq', FZK, '--project', plain, '--locale', 'ro']);
    expect(r.out).toContain('\n5 elemente nu au o cantitate pe care o ia un articol: EXAMPLE-D (5).\n');
    expect(r.out).toContain('Antemăsurătoare: ');
    expect(r.out.split('\n').filter((l) => /\b(elements|lack|takes|article)\b/.test(l))).toEqual([]);
    expect((await text(['boq', FZK, '--project', ro])).out).toContain('5 elemente nu au o cantitate');
    expect((await text(['boq', FZK, '--project', plain])).out).toContain('\n5 elements lack a quantity an article takes: EXAMPLE-D (5).\n');
  });

  it('materials: every phrase is Romanian, English unchanged', async () => {
    const r = await text(['materials', FZK, '--locale', 'ro']);
    expect(r.code).toBe(EXIT.ok);
    expect(r.out).toMatch(/hașură \S+ x[\d.]+, pix \S+; umplere \S+; dedus din denumire/);
    expect(r.out).not.toMatch(/\b(hatch|fill|guessed|pen|from the project)\b/);
    expect((await text(['materials', FZK])).out).toMatch(/hatch \S+ x[\d.]+, \S+ pen; fill \S+; guessed from the name/);
    expect((await text(['materials', FZK, '--project', ro])).out).toContain('dedus din denumire');
  });

  it('classify: the type and count lines are Romanian, English unchanged', async () => {
    const r = await text(['classify', FZK, '--project', plain, '--locale', 'ro']);
    expect(r.out).toMatch(/\n\d+ elemente fără cod\.\n$/);
    expect(r.out).toContain(' (fără tip)');
    expect(r.out).not.toMatch(/\b(elements|no code|no type)\b/);
    const en = await text(['classify', FZK, '--project', plain]);
    expect(en.out).toMatch(/\n\d+ elements have no code\.\n$/);
    expect(en.out).toContain(' (no type)');
  });

  it('list: the table is in the resolved language, the project\'s first', async () => {
    const r = await text(['list', FZK, '--project', ro]);
    expect(r.code).toBe(EXIT.ok);
    expect(r.out).toMatch(/\d,\d/);
    expect(r.out).not.toMatch(/\d\.\d/);
    expect((await text(['list', FZK, '--project', plain])).out).toMatch(/\d\.\d/);
  });

  it('check: the heading, the count and every finding are Romanian', async () => {
    const r = await text(['check', FZK, '--locale', 'ro']);
    const lines = r.out.split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBeGreaterThan(0);
    expect(r.out).toMatch(/lucr(u care lipsește|uri care lipsesc) modelului|modelul are ce citește setul de planșe/);
    expect(r.out).not.toMatch(/\b(the model|things? the model|lacks|has no)\b/);
    const en = await text(['check', FZK]);
    expect(en.out).toMatch(/the model lacks|the model has what the drawing set reads/);
  });

  it('a --locale that is not ro or en is a usage error on every one of them', async () => {
    for (const argv of [['rooms', FZK], ['boq', FZK, '--project', plain], ['materials', FZK], ['classify', FZK, '--project', plain], ['list', FZK, '--project', plain], ['check', FZK]]) {
      const r = await text([...argv, '--locale', 'de']);
      expect([r.code, r.err]).toEqual([EXIT.usage, expect.stringContaining('--locale must be one of en, ro')]);
    }
  });
});
