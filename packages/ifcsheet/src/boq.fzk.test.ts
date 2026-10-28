/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities on AC20-FZK-Haus (#75). Its walls DECLARE Qto_WallBaseQuantities (NetVolume, NetSideArea, Length ...) in cubic
 * metres: 5 walls of the type "Leichtbeton 102890359 240" and 8 of "... 300". Its doors and windows declare a `Volume` but no NetVolume,
 * which is the fixture for the elements that do not state a quantity. The article codes are EXAMPLES made up for the tests.
 */

import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { RelationshipType } from '@ifc-lite/data';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import { run } from './cli.js';
import { boqPropertyNames, newArticle, type BoqArticle } from './boq.js';
import { boqMissing, computeBoq, type BoqElement } from './boq-compute.js';
import { boqTable } from './boq-table.js';
import { boqSayFor } from './boq-words.js';
import { openModel, type OpenedModel } from './model.js';
import { readBoqElements, storeSource } from './boq-read.js';
import { readinessWithProject, readProjectFile } from './project-read.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus bill of quantities test: ${missing}`);

const TYPE_240 = 'Leichtbeton 102890359 240';
const TYPE_300 = 'Leichtbeton 102890359 300';
const example = (patch: Partial<BoqArticle>): BoqArticle => ({ ...newArticle('a1', 'm3'), code: 'EXAMPLE-01', description: 'EXAMPLE: walls', quantity: 'NetVolume', ...patch });

describe.skipIf(missing !== null)('the bill of quantities of AC20-FZK-Haus', () => {
  let model: OpenedModel;
  let elements: BoqElement[];
  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)), { geometry: false });
    elements = readBoqElements(storeSource('m', model.dataStore), new Set(['ebene', 'thermaltransmittance']));
  }, 120_000);

  /** The declared NetVolume of every wall of a type, read straight from the model's quantity sets (not through the reader under test). */
  function declaredNetVolumes(typeName: string): number[] {
    const store = model.dataStore;
    const out: number[] = [];
    for (const id of (store.entityIndex.byType.get('IFCWALLSTANDARDCASE') ?? [])) {
      const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
      if (typeId === undefined || store.entities.getName(typeId) !== typeName) continue;
      const q = extractQuantitiesOnDemand(store, id).flatMap((s) => s.quantities).find((x) => x.name === 'NetVolume');
      expect(q, 'the wall declares NetVolume').toBeDefined();
      out.push(q!.value);
    }
    return out;
  }

  it('maps the walls of one type to an article and gives the exact sum of their declared volumes in m3', () => {
    const volumes = declaredNetVolumes(TYPE_240);
    expect(volumes).toHaveLength(5);
    const line = computeBoq(elements, [example({ typeName: TYPE_240 })]).lines[0];
    expect(line.problem).toBeNull();
    expect(line.total).toBeCloseTo(volumes.reduce((a, b) => a + b, 0), 9);
    expect(line.total).toBeCloseTo(13.132669891109998, 9);
    expect([line.matched, line.counted, line.missing.length]).toEqual([5, 5, 0]);
    expect(computeBoq(elements, [example({ typeName: TYPE_300 })]).lines[0].total).toBeCloseTo(41.3484107405, 9);
  });

  it('applies the factor and the waste to that sum', () => {
    const sum = declaredNetVolumes(TYPE_240).reduce((a, b) => a + b, 0);
    expect(computeBoq(elements, [example({ typeName: TYPE_240, waste: 5 })]).lines[0].total).toBeCloseTo(sum * 1.05, 9);
    expect(computeBoq(elements, [example({ typeName: TYPE_240, factor: 2, waste: 10 })]).lines[0].total).toBeCloseTo(sum * 2.2, 9);
  });

  it('narrows by the schedule filter: a property test and a storey', () => {
    const external = { classes: ['IfcWall'], properties: [{ name: 'Ebene', op: 'equals' as const, value: 'Außenwände' }] };
    const all = computeBoq(elements, [example({ filter: external })]).lines[0];
    expect([all.matched, all.total]).toEqual([8, computeBoq(elements, [example({ typeName: TYPE_300 })]).lines[0].total]);
    const ground = computeBoq(elements, [example({ filter: { ...external, levels: ['Erdgeschoss'] } })]).lines[0];
    expect(ground.matched).toBe(4);
    expect(ground.total).toBeLessThan(all.total!);
    expect(boqPropertyNames([example({ filter: external })])).toEqual(['ebene']);
  });

  it('refuses a unit that is not the quantity\'s', () => {
    const line = computeBoq(elements, [example({ typeName: TYPE_240, unit: 'm2' })]).lines[0];
    expect([line.total, line.problem?.kind]).toEqual([null, 'unitMismatch']);
  });

  it('reports the elements that do not declare the quantity: the 5 doors have no NetVolume', () => {
    const doors = example({ id: 'd', code: 'EXAMPLE-D', filter: { classes: ['IfcDoor'] } });
    const result = computeBoq(elements, [doors]);
    const line = result.lines[0];
    expect([line.matched, line.counted, line.missing.length, line.total]).toEqual([5, 0, 5, null]);
    expect(line.missing.every((m) => m.ifcClass === 'IfcDoor' && m.globalId.length === 22)).toBe(true);
    expect(boqMissing(result)).toMatchObject({ elements: 5, articles: 1, list: 'EXAMPLE-D (5)' });
    // The declared `Volume` is another quantity the office can choose on purpose.
    expect(computeBoq(elements, [{ ...doors, quantity: 'Volume' }]).lines[0].total).toBeGreaterThan(0.4);
  });

  it('puts the totals in a table with numeric cells', () => {
    const table = boqTable(computeBoq(elements, [example({ typeName: TYPE_240 })]), boqSayFor('ro'), { detail: true });
    expect(table.header).toEqual(['Nr. crt.', 'Cod articol', 'Denumire', 'U.M.', 'Cantitate']);
    expect(table.rows[0].slice(0, 4)).toEqual([1, 'EXAMPLE-01', 'EXAMPLE: walls', 'm³']);
    expect(typeof table.rows[0][4]).toBe('number');
    expect(table.rows[1][2]).toBe(`  ${TYPE_240}`);
  });

  it('is what the command line prints, and the readiness check names the missing quantities', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'boq-'));
    const articles = [example({ typeName: TYPE_240 }), example({ id: 'd', code: 'EXAMPLE-D', filter: { classes: ['IfcDoor'] } })];
    const projectFile = join(dir, 'p.ifclite-project.json');
    writeFileSync(projectFile, JSON.stringify({ format: 'ifclite-project', version: 1, name: 'p', boqArticles: articles }));
    const out: string[] = [];
    const io = { stdout: (t: string) => void out.push(t), stderr: (t: string) => void out.push(`ERR ${t}`) };
    expect(await run(['boq', FZK, '--project', projectFile, '--json'], io)).toBe(0);
    const json = JSON.parse(out.join(''));
    expect(json.articles[0].total).toBeCloseTo(13.132669891109998, 6);
    expect(json.articles[1]).toMatchObject({ total: null, matched: 5, counted: 0 });
    expect(json.articles[1].missing).toHaveLength(5);
    out.length = 0;
    expect(await run(['boq', FZK, '--project', projectFile, '--csv', '--locale', 'ro'], io)).toBe(0);
    expect(out.join('')).toContain('Nr. crt.;Cod articol;Denumire;U.M.;Cantitate');
    expect(out.join('')).toContain('1;EXAMPLE-01;EXAMPLE: walls;m³;13.13267');
    const findings = readinessWithProject(model, readProjectFile(readFileSync(projectFile, 'utf8')));
    expect(findings.map((f) => f.kind)).toContain('boqMissingQuantity');
    expect(findings.find((f) => f.kind === 'boqMissingQuantity')?.params).toMatchObject({ count: 5, list: 'EXAMPLE-D (5)' });
  }, 120_000);
});
