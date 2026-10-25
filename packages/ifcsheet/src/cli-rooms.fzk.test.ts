/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet rooms` on AC20-FZK-Haus (#42): the seven rooms with the NetFloorArea of the IFC text, a total per level and the
 * building's (173.342437 m², the Au the app's urban sheet prints; see `urban-fzk.test.ts` for the hand sum), in English and
 * Romanian, as text, CSV and JSON; and the command line's failures.
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
if (missing) console.warn(`[ifcsheet] skipping the rooms test of the CLI: ${missing}`);

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(missing !== null)('ifcsheet rooms, on AC20-FZK-Haus', () => {
  it('lists the rooms by level with the model\'s areas and the totals', async () => {
    const c = capture();
    expect(await run(['rooms', FZK], c.io)).toBe(EXIT.ok);
    const text = c.out();
    expect(text).toContain('4    Schlafzimmer');
    expect(text).toMatch(/Schlafzimmer\s+Erdgeschoss\s+21\.41/);
    expect(text).toMatch(/Total Erdgeschoss\s+98\.83/);
    expect(text).toMatch(/Total Dachgeschoss\s+74\.51/);
    expect(text).toMatch(/Total building \(Au\)\s+173\.34/);
    expect(text).toContain('areas from 7 model quantity, 0 geometry');
  });

  it('writes Romanian with the decimal comma and the glossary\'s words', async () => {
    const c = capture();
    expect(await run(['rooms', FZK, '--locale', 'ro'], c.io)).toBe(EXIT.ok);
    expect(c.out()).toMatch(/Total clădire \(Au\)\s+173,34/);
    expect(c.out()).toContain('Arie utilă m²');
  });

  it('writes CSV and JSON in plain numbers: the building total is the sum by hand', async () => {
    const csv = capture();
    expect(await run(['rooms', FZK, '--csv'], csv.io)).toBe(EXIT.ok);
    const rows = csv.out().trim().split('\n');
    expect(rows[0]).toBe('No.,Room,Level,Useful area m²,Source');
    expect(rows).toContain('4,Schlafzimmer,Erdgeschoss,21.410325,model quantity');
    expect(rows[rows.length - 1]).toBe(',Total building (Au),,173.342437,');
    const json = capture();
    expect(await run(['rooms', FZK, '--json'], json.io)).toBe(EXIT.ok);
    const data = JSON.parse(json.out()) as { total: number; rooms: number; areaFromGeometry: number; levels: { name: string; total: number }[]; leftOut: object };
    expect(data.total).toBeCloseTo(21.410325 + 12.127619 + 12.59545 + 25.2088935 + 11.185458 + 16.30545 + 74.5092415823, 6);
    expect(data.rooms).toBe(7);
    expect(data.areaFromGeometry).toBe(0);
    expect(data.levels.map((l) => l.name)).toEqual(['Erdgeschoss', 'Dachgeschoss']);
    expect(data.leftOut).toEqual({ external: 0, gfa: 0, parents: 0 });
  });

  it('fails plainly: no file, a model with no room, a wrong command line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-rooms-'));
    dirs.push(dir);
    const none = capture();
    expect(await run(['rooms', join(dir, 'absent.ifc')], none.io)).toBe(EXIT.failed);
    expect(none.err()).toContain('no such file');
    const empty = join(dir, 'empty.ifc');
    writeFileSync(empty, "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n");
    const noRooms = capture();
    expect(await run(['rooms', empty], noRooms.io)).toBe(EXIT.failed);
    expect(noRooms.err()).toContain('has no rooms');
    const bad = capture();
    expect(await run(['rooms', FZK, '--csv', '--json'], bad.io)).toBe(EXIT.usage);
    expect(await run(['rooms', FZK, '--out', 'x.pdf'], capture().io)).toBe(EXIT.usage);
    expect(await run(['check', FZK, '--csv'], capture().io)).toBe(EXIT.usage);
    expect(await run(['build', FZK, '--out', 'x.pdf', '--locale', 'ro'], capture().io)).toBe(EXIT.usage);
  }, 120_000);
});
