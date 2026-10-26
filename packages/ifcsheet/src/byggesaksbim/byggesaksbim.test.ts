/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM check (#372): the shipped IDS, the findings it gives on a German model with no Norwegian data (FZK, the
 * README's IfcTester run), on a compliant model, and on a compliant model with one piece taken away.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IDSValidationReport } from '@ifc-lite/ids';
import { describe, expect, it } from 'vitest';
import { openModel } from '../model.js';
import { describeReadiness } from '../readiness.js';
import { BYGGESAKSBIM_SPECS, byggesaksbimFindings } from './byggesaksbim.js';
import { BYGGESAKSBIM_IDS } from './byggesaksbim-ids.js';
import { byggesaksbimDocument, byggesaksbimReadiness, byggesaksbimReport } from './run.js';
import { syntheticByggesaksbimModel, type SyntheticPiece } from './synthetic-model.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const IDS_FILE = fileURLToPath(new URL('./byggesaksbim.ids', import.meta.url));

const open = (step: string) => openModel(new TextEncoder().encode(step), { geometry: false });
const kinds = async (step: string) => (await byggesaksbimReadiness([{ dataStore: (await open(step)).dataStore }])).map((f) => f.kind);

describe('the shipped IDS', () => {
  it('is the file next to it, byte for byte', () => {
    expect(BYGGESAKSBIM_IDS).toBe(readFileSync(IDS_FILE, 'utf8'));
  });

  it('cites its source and date in a header comment', () => {
    expect(BYGGESAKSBIM_IDS).toMatch(/<!--[\s\S]*DiBK[\s\S]*P13 eByggesak[\s\S]*2026-10-26[\s\S]*-->/);
  });

  it('holds the eight requirements, NO-H1 to NO-H8, in order', () => {
    expect(byggesaksbimDocument().specifications.map((s) => s.identifier)).toEqual([...BYGGESAKSBIM_SPECS]);
  });
});

describe.skipIf(!existsSync(FZK))('FZK, a German model with no Norwegian data', () => {
  it('fails the matrikkel number and the two storey areas, as IfcTester did; BYA and the building type pass, the zone and lift ones pass for want of elements', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)), { geometry: false });
    const report = await byggesaksbimReport(model.dataStore);
    expect(report.specificationResults.map((r) => [r.specification.identifier, r.status, r.applicableCount, r.failedCount])).toEqual([
      ['NO-H1', 'fail', 1, 1], ['NO-H2', 'pass', 1, 0], ['NO-H3', 'pass', 1, 0], ['NO-H4', 'fail', 2, 2],
      ['NO-H5', 'fail', 2, 2], ['NO-H6', 'pass', 0, 0], ['NO-H7', 'pass', 0, 0], ['NO-H8', 'pass', 0, 0],
    ]);
    const findings = byggesaksbimFindings([report]);
    expect(findings.map((f) => [f.kind, f.params.count, f.params.total])).toEqual([['byggesaksbimH1', 1, 1], ['byggesaksbimH4', 2, 2], ['byggesaksbimH5', 2, 2]]);
    expect(findings.every((f) => (f.guids?.length ?? 0) > 0)).toBe(true);
    expect(describeReadiness(findings[2]).missing).toMatch(/^BRA \(usable area, Pset_BuildingStoreyCommon\.NetPlannedArea\) missing on 2 of 2 storeys: '.+', '.+'\.$/);
  }, 120_000);
});

describe('a compliant model', () => {
  it('has nothing to report', async () => {
    expect(await kinds(syntheticByggesaksbimModel())).toEqual([]);
  });

  const cases: [SyntheticPiece, string][] = [
    ['matrikkel', 'byggesaksbimH1'], ['bya', 'byggesaksbimH2'], ['buildingType', 'byggesaksbimH3'], ['bta', 'byggesaksbimH4'],
    ['bra', 'byggesaksbimH5'], ['zoneReference', 'byggesaksbimH6'], ['zoneBra', 'byggesaksbimH7'], ['liftType', 'byggesaksbimH8'],
  ];
  for (const [piece, kind] of cases) {
    it(`reports exactly ${kind} when ${piece} is taken away`, async () => {
      expect(await kinds(syntheticByggesaksbimModel({ without: [piece] }))).toEqual([kind]);
    });
  }

  it('names the element and says what is wrong in words', async () => {
    const [f] = await byggesaksbimReadiness([{ dataStore: (await open(syntheticByggesaksbimModel({ without: ['bra'] }))).dataStore }]);
    expect(describeReadiness(f).missing).toBe("BRA (usable area, Pset_BuildingStoreyCommon.NetPlannedArea) missing on 1 of 1 storeys: '1'.");
    expect(f.guids).toEqual(['18YevMn_nCqegZ5pOkFRtT']);
  });

  for (const bad of ['904-200/2430/0/14', '0904-0200/2430/0/14', '0904-200/2430/14', '0904-200/2430/0/14 ', 'abc']) {
    it(`fails the matrikkel number ${JSON.stringify(bad)}`, async () => {
      expect(await kinds(syntheticByggesaksbimModel({ matrikkel: bad }))).toEqual(['byggesaksbimH1']);
    });
  }
});

/** A report with only what `byggesaksbimFindings` reads. */
function report(specs: { id: string; applicable: number; failed: { name: string; guid: string }[]; cardinalityPassed?: boolean }[]): IDSValidationReport {
  return {
    specificationResults: specs.map((s) => ({
      specification: { identifier: s.id },
      applicableCount: s.applicable,
      ...(s.cardinalityPassed === undefined ? {} : { cardinalityResult: { passed: s.cardinalityPassed } }),
      entityResults: s.failed.map((e, i) => ({ passed: false, expressId: i + 1, entityName: e.name, globalId: e.guid })),
    })),
  } as unknown as IDSValidationReport;
}

describe('findings from reports', () => {
  it('says a missing element once, and only when no model has one', () => {
    const none = (id: string) => ({ id, applicable: 0, failed: [], cardinalityPassed: false });
    const has = (id: string) => ({ id, applicable: 1, failed: [], cardinalityPassed: true });
    expect(byggesaksbimFindings([report([none('NO-H2'), none('NO-H3'), none('NO-H4')])]).map((f) => [f.kind, f.params])).toEqual([['byggesaksbimNone', { class: 'IfcBuilding' }], ['byggesaksbimNone', { class: 'IfcBuildingStorey' }]]);
    expect(byggesaksbimFindings([report([none('NO-H2')]), report([has('NO-H2')])])).toEqual([]);
  });

  it('adds up the models and names at most eight elements', () => {
    const failed = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ name: `${p}${i}`, guid: `${p}${i}` }));
    const [f] = byggesaksbimFindings([report([{ id: 'NO-H4', applicable: 6, failed: failed(6, 'a') }]), report([{ id: 'NO-H4', applicable: 4, failed: failed(4, 'b') }])]);
    expect(f.params).toEqual({ count: 10, total: 10, list: "'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'b0', 'b1', … +2" });
    expect(f.guids).toHaveLength(10);
  });
});
