/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The rooms Au measures from geometry are reported, never counted silently (#42). */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { modelReadiness, describeReadiness } from './readiness.js';
import { estimatedAreas } from './room-estimates.js';
import type { RoomRecord } from './room-schedule.js';

const room = (id: string, number: string, name: string, level: number | null, area: number | null, source: RoomRecord['source'] = 'quantity'): RoomRecord => ({ id, number, name, level, area, source: area === null ? null : source, perimeter: null });
const FACTS = { storeys: 1, spaces: 3, elements: 0, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };

describe('estimatedAreas', () => {
  it('is null when every room states its area, or none has one', () => {
    expect(estimatedAreas([room('a', '1', 'Hall', 0, 10), room('b', '2', 'Bath', 0, 5)])).toBeNull();
    expect(estimatedAreas([room('a', '1', 'Hall', 0, null)])).toBeNull();
    expect(estimatedAreas([])).toBeNull();
  });

  it('names the rooms measured from geometry, their area and their share of Au, which they are counted in', () => {
    const e = estimatedAreas([room('a', '10', 'Gallery', 1, 30, 'geometry'), room('b', '2', 'Bath', 0, 20), room('c', '1', 'Hall', 0, 40), room('d', '3', 'Loft', 1, 10, 'geometry'), room('e', '4', 'Store', 0, null)]);
    expect(e).toMatchObject({ count: 2, area: 40, au: 100, share: 40 });
    expect(e!.rooms.map((r) => r.name)).toEqual(['Loft', 'Gallery']);
  });
});

describe('the estimated-areas finding', () => {
  const guess = estimatedAreas([room('G1', '7', 'Galerie', 1, 107.16, 'geometry'), room('G2', '1', 'Flur', 0, 98.83)])!;
  it('says how many rooms, how much of Au and which, with the first to go to', () => {
    const findings = modelReadiness({ ...FACTS, estimatedAreas: guess });
    const f = findings.find((x) => x.kind === 'estimatedAreas')!;
    expect(f.params).toEqual({ count: 1, area: 107.2, share: 52, list: "'7 Galerie'", first: 'G1' });
    expect(describeReadiness(f).missing).toBe("Au includes 1 rooms whose area the model doesn't state; they are measured from geometry (≈ 107.2 m², 52 % of Au) and may be wrong under sloped ceilings: '7 Galerie'.");
  });
  it('is absent when every room states its area', () => {
    expect(modelReadiness({ ...FACTS }).some((x) => x.kind === 'estimatedAreas')).toBe(false);
  });
});

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const capture = () => { const out: string[] = []; return { io: { stdout: (t: string) => void out.push(t), stderr: () => undefined }, out: () => out.join('') }; };

describe.skipIf(missing !== null)('ifcsheet check, on AC20-FZK-Haus', () => {
  it('reports the attic gallery once the model stops stating its area, and nothing about areas while every room states one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-est-'));
    dirs.push(dir);
    // The gallery's two area quantities (#76387..#76399 of its BaseQuantities) lose their names: nothing states its area.
    const text = readFileSync(FZK, 'latin1').replace(/^(#763(?:8[7-9]|9\d)=\s*IFCQUANTITYAREA\(')((?:Net|Gross)FloorArea)'/gm, "$1X$2'");
    expect(text).not.toBe(readFileSync(FZK, 'latin1'));
    const variant = join(dir, 'gallery.ifc');
    writeFileSync(variant, text, 'latin1');
    const whole = capture();
    await run(['check', FZK, '--json'], whole.io);
    expect((JSON.parse(whole.out()) as { findings: { kind: string }[] }).findings.some((f) => f.kind === 'estimatedAreas')).toBe(false);
    const cut = capture();
    expect(await run(['check', variant, '--json'], cut.io)).toBe(EXIT.failed);
    const f = (JSON.parse(cut.out()) as { findings: { kind: string; missing: string; params: Record<string, unknown> }[] }).findings.find((x) => x.kind === 'estimatedAreas')!;
    expect(f.params).toMatchObject({ count: 1, list: "'7 Galerie'" });
    expect(f.params.area).toBeCloseTo(107.2, 1);
    expect(f.params.share).toBe(52);
    expect(f.missing).toContain('1 rooms whose area the model doesn\'t state');
  }, 180_000);
});
