/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities' rules on elements made by hand (#75): the sum, the factor and the waste, the refusal of a unit that is not the
 * quantity's, the missing quantity that is reported and never zeroed, the filter, and the table. The same rules on a real model are in
 * `boq.fzk.test.ts`. The article codes below are EXAMPLES made up for the tests: IfcSheet ships no norm or article code.
 */

import { describe, expect, it } from 'vitest';
import { boqProblem, boqPropertyNames, newArticle, quantityDimension, readBoqArticles, type BoqArticle } from './boq.js';
import { boqMissing, computeBoq, type BoqElement } from './boq-compute.js';
import { boqTable, describeBoqProblem } from './boq-table.js';
import { BOQ_WORDS_EN, BOQ_WORDS_RO, boqSayFor } from './boq-words.js';
import { describeReadiness, modelReadiness } from './readiness.js';

let n = 0;
/** A wall of `type` with the quantities given (NetVolume, NetSideArea ... in SI); `volume: undefined` leaves the quantity undeclared. */
function wall(type: string | null, volume: number | undefined, extra: Partial<BoqElement> = {}): BoqElement {
  n++;
  return {
    modelId: 'm', expressId: n, globalId: `G${n}`, name: `Wall ${n}`, ifcClass: 'IfcWallStandardCase', predefinedType: null,
    typeClass: type === null ? null : 'IfcWallType', typeName: type, level: 'Ground', materials: ['Concrete'], properties: [],
    quantities: volume === undefined ? [{ name: 'Length', dimension: 'length', value: 4 }] : [{ name: 'NetVolume', dimension: 'volume', value: volume }, { name: 'Length', dimension: 'length', value: 4 }],
    ...extra,
  };
}

/** An EXAMPLE article: made up for the tests, not a norm code. */
const example = (patch: Partial<BoqArticle> = {}): BoqArticle => ({
  ...newArticle('a1', 'm3'), code: 'EXAMPLE-01', description: 'EXAMPLE: walls of type T240', typeName: 'T240', quantity: 'NetVolume', ...patch,
});

describe('the sum of an article', () => {
  const walls = [wall('T240', 2.5), wall('T240', 1.25), wall('T300', 9), wall(null, 4)];

  it('adds the declared quantity of the elements its type picks, in the article unit', () => {
    const { lines } = computeBoq(walls, [example()]);
    expect(lines[0].total).toBeCloseTo(3.75, 12);
    expect([lines[0].matched, lines[0].counted, lines[0].missing.length]).toEqual([2, 2, 0]);
    expect(lines[0].byType.map((t) => [t.typeName, t.total])).toEqual([['T240', 3.75]]);
  });

  it('multiplies by the factor and adds the waste percentage', () => {
    expect(computeBoq(walls, [example({ factor: 2 })]).lines[0].total).toBeCloseTo(7.5, 12);
    expect(computeBoq(walls, [example({ waste: 5 })]).lines[0].total).toBeCloseTo(3.75 * 1.05, 12);
    const both = computeBoq(walls, [example({ factor: 0.5, waste: 10 })]).lines[0];
    expect(both.total).toBeCloseTo(3.75 * 0.5 * 1.1, 12);
    expect(both.byType[0].total).toBeCloseTo(both.total!, 12);
  });

  it('picks by material and by IFC class too, and an IfcWallStandardCase answers to IfcWall', () => {
    const byMaterial = computeBoq(walls, [example({ typeName: undefined, material: ' concrete ' })]).lines[0];
    expect(byMaterial.matched).toBe(4);
    const byClass = computeBoq(walls, [example({ typeName: undefined, filter: { classes: ['IfcWall'] } })]).lines[0];
    expect(byClass.total).toBeCloseTo(16.75, 12);
    expect(computeBoq(walls, [example({ typeName: undefined, filter: { classes: ['IfcSlab'] } })]).lines[0].matched).toBe(0);
  });

  it('flags an element picked by material that has other materials too, its whole quantity counted', () => {
    const layered = [wall('T240', 3, { materials: ['Concrete', 'Plaster'] }), wall('T240', 1)];
    const line = computeBoq(layered, [example({ typeName: undefined, material: 'Concrete' })]).lines[0];
    expect([line.total, line.sharedMaterial]).toEqual([4, 1]);
  });

  it('applies the schedule filter: property tests and storeys narrow what a type picks', () => {
    const els = [
      wall('T240', 1, { level: 'Ground', properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'true' }] }),
      wall('T240', 10, { level: 'Ground', properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'false' }] }),
      wall('T240', 100, { level: 'Roof', properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'true' }] }),
    ];
    const external = { properties: [{ name: 'IsExternal', op: 'equals' as const, value: 'true' }] };
    expect(computeBoq(els, [example({ filter: external })]).lines[0].total).toBe(101);
    expect(computeBoq(els, [example({ filter: { ...external, levels: ['Ground'] } })]).lines[0].total).toBe(1);
    expect(boqPropertyNames([example({ filter: external })])).toEqual(['isexternal']);
  });

  it('counts pieces by the element itself: Count is never missing', () => {
    const pieces = computeBoq([wall('T240', undefined), wall('T240', 1)], [example({ unit: 'buc', quantity: 'Count' })]).lines[0];
    expect([pieces.total, pieces.missing.length]).toEqual([2, 0]);
  });
});

describe('a unit that is not the quantity\'s', () => {
  it('is refused with a message naming the quantity and the unit it gives, and is not computed', () => {
    const bad = example({ unit: 'm2' });
    expect(quantityDimension('NetVolume')).toBe('volume');
    expect(boqProblem(bad)).toMatchObject({ kind: 'unitMismatch', params: { quantity: 'NetVolume', unit: 'm²', fits: 'm³' } });
    const { lines } = computeBoq([wall('T240', 2)], [bad, example({ id: 'a2', code: 'EXAMPLE-02' })]);
    expect(lines[0].total).toBeNull();
    expect(lines[0].problem && describeBoqProblem(lines[0].problem, boqSayFor('en'))).toBe('EXAMPLE-01: NetVolume gives m³, not m². Change the unit to m³ or choose a quantity in m².');
    expect(lines[1].total).toBe(2);
  });

  it('refuses a volume priced per piece, an area per metre and a mass without a mass quantity', () => {
    for (const [quantity, unit] of [['NetVolume', 'buc'], ['NetSideArea', 'm'], ['Length', 'm2'], ['NetWeight', 'm3'], ['Count', 'kg']] as const) {
      expect(boqProblem(example({ quantity, unit }))?.kind, `${quantity} in ${unit}`).toBe('unitMismatch');
    }
    expect(boqProblem(example({ quantity: 'NetWeight', unit: 'kg' }))).toBeNull();
  });

  it('refuses an article with no code, nothing to pick, an unknown quantity, a bad factor or waste', () => {
    expect(boqProblem(example({ code: ' ' }))?.kind).toBe('noCode');
    expect(boqProblem(example({ typeName: undefined }))?.kind).toBe('noSelector');
    expect(boqProblem(example({ quantity: 'Angle' }))?.kind).toBe('unknownQuantity');
    expect(boqProblem(example({ factor: 0 }))?.kind).toBe('badFactor');
    expect(boqProblem(example({ waste: -1 }))?.kind).toBe('badWaste');
    expect(boqProblem(example({ waste: 101 }))?.kind).toBe('badWaste');
  });
});

describe('an element that does not declare the quantity', () => {
  it('is reported and left out of the sum, never counted as zero', () => {
    const els = [wall('T240', 2), wall('T240', undefined), wall('T240', undefined)];
    const line = computeBoq(els, [example()]).lines[0];
    expect([line.total, line.matched, line.counted]).toEqual([2, 3, 1]);
    expect(line.missing.map((m) => m.expressId)).toEqual([els[1].expressId, els[2].expressId]);
    expect(line.byType[0]).toMatchObject({ matched: 3, counted: 1, missing: 2, total: 2 });
    expect(boqMissing({ lines: [line] })).toEqual({ elements: 2, articles: 1, list: 'EXAMPLE-01 (2)' });
  });

  it('leaves the total empty, not 0, when no picked element states it', () => {
    const line = computeBoq([wall('T240', undefined)], [example()]).lines[0];
    expect([line.total, line.missing.length]).toEqual([null, 1]);
    expect(computeBoq([], [example()]).lines[0].total).toBeNull();
  });

  it('is a readiness finding that names the articles and says the elements are not zero', () => {
    const line = computeBoq([wall('T240', undefined)], [example()]);
    const findings = modelReadiness({ storeys: 1, spaces: 1, elements: 1, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 }, [], boqMissing(line));
    expect(findings.map((f) => f.kind)).toEqual(['boqMissingQuantity']);
    const said = describeReadiness(findings[0]);
    expect(said.missing).toContain('1 elements lack a quantity');
    expect(said.missing).toContain('EXAMPLE-01 (1)');
    expect(said.effect).toContain('not counted as zero');
    expect(modelReadiness({ storeys: 1, spaces: 1, elements: 1, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 }, [], boqMissing(computeBoq([wall('T240', 1)], [example()])))).toEqual([]);
  });
});

describe('the saved articles', () => {
  it('read back what was written and drop what is not an article', () => {
    const full: BoqArticle = example({ waste: 7.5, factor: 1.2, material: 'Concrete', filter: { classes: ['IfcWall'], levels: ['Ground'], predefined: ['SOLIDWALL'], properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] } });
    expect(readBoqArticles(JSON.parse(JSON.stringify([full, { code: 'no id' }, 'x', null])))).toEqual([full]);
    expect(readBoqArticles({})).toEqual([]);
    expect(readBoqArticles([{ id: 'x', unit: 'furlong', factor: 'big', filter: { kinds: ['door'], types: ['t'] } }])).toEqual([{ id: 'x', code: '', description: '', unit: 'm3', quantity: 'NetVolume', factor: 1 }]);
  });
});

describe('the table', () => {
  const els = [wall('T240', 2), wall('T240', undefined), wall('T300', 5), wall(null, 1)];
  const articles = [example(), example({ id: 'a2', code: 'EXAMPLE-02', description: 'EXAMPLE: all walls', typeName: undefined, filter: { classes: ['IfcWall'] } }), example({ id: 'a3', code: 'EXAMPLE-03', unit: 'm2' })];
  const result = computeBoq(els, articles);

  it('has Nr. crt., code, description, unit and quantity, in Romanian when asked, with figures as numbers', () => {
    const ro = boqTable(result, boqSayFor('ro'));
    expect(ro.header).toEqual(['Nr. crt.', 'Cod articol', 'Denumire', 'U.M.', 'Cantitate']);
    expect(ro.rows).toEqual([[1, 'EXAMPLE-01', 'EXAMPLE: walls of type T240', 'm³', 2], [2, 'EXAMPLE-02', 'EXAMPLE: all walls', 'm³', 8], [3, 'EXAMPLE-03', 'EXAMPLE: walls of type T240', 'm²', null]]);
    expect(boqTable(result, boqSayFor('en')).header[0]).toBe('No.');
    expect(ro.numeric).toEqual([0, 4]);
  });

  it('adds a detail row per type under each article when asked, and says what was left out', () => {
    const detail = boqTable(result, boqSayFor('en'), { detail: true });
    expect(detail.rows.map((r) => r[2])).toEqual(['EXAMPLE: walls of type T240', '  T240', 'EXAMPLE: all walls', '  T240', '  T300', '  WallStandardCase (no type)', 'EXAMPLE: walls of type T240', ]);
    expect(detail.bold).toEqual([0, 2, 6]);
    expect(detail.notes.join('\n')).toContain('EXAMPLE-01: 1 elements do not declare NetVolume and are left out of the quantity (not counted as zero).');
    expect(detail.notes.join('\n')).toContain('EXAMPLE-03: refused. EXAMPLE-03: NetVolume gives m³, not m².');
  });

  it('has Romanian and English words for every key', () => {
    expect(Object.keys(BOQ_WORDS_RO).sort()).toEqual(Object.keys(BOQ_WORDS_EN).sort());
    for (const key of Object.keys(BOQ_WORDS_EN) as (keyof typeof BOQ_WORDS_EN)[]) {
      expect([...BOQ_WORDS_EN[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), key).toEqual([...BOQ_WORDS_RO[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
    }
  });
});
