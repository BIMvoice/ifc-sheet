/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #76: the urban indicators of AC20-FZK-Haus against a computation by hand.
 *
 * The hand figures, from the STEP text:
 * - Ac. The four external walls of the ground floor (`Wand-Ext-ERDG-1..4`,
 *   #21966 #27421 #31470 #32407) are 0.3 m thick (IfcMaterialLayer #21970)
 *   with their Axis on the OUTER face (#21956: (0,0)-(10,0); the profile
 *   #21926 runs inward to y = -0.3). Their axes are 10 m and 12 m long
 *   (bounding boxes 10 × 0.3 and 12 × 0.3 × 2.7, e.g. #21949) and meet at the
 *   corners, so the outer faces bound a 12.0 × 10.0 m rectangle: Ac = 120.00
 *   m². Cross-check: the base slab `Bodenplatte` (#34509) states GrossArea
 *   120.0 in its quantities; the test reads it from the parsed model.
 *   Measured to the inner face it would be 11.4 × 9.4 = 107.16 m².
 * - Ad. The attic storey `Dachgeschoss` (elevation 2.7) stands on the same
 *   rectangle: its walls `Wand-Ext-OG-1..4` (#60012 #67536 #67828 #75347)
 *   repeat the ground-floor outline. Ad sums every storey: 2 × 120.00 =
 *   240.00 m². Neither storey is a basement, so Ad for CUT is the same 240.00
 *   and CUT is unchanged by the #111 review's Ad / Ad for CUT split.
 * - Ac is taken on the storey containing ±0.00: `Erdgeschoss`, elevation 0.
 * - Au. The NetFloorArea of the seven rooms, from their `BaseQuantities`
 *   sets: 21.410325 (Schlafzimmer) + 12.127619 (Bad) + 12.59545 (Buero)
 *   + 25.2088935 (Wohnen) + 11.185458 (Flur) + 16.30545 (Küche)
 *   + 74.5092415823 (Galerie) = 173.3424370823 m². The seven IfcSpace
 *   leave PredefinedType unset and aggregate no spaces, so all seven are
 *   rooms under the #111 review's filter, and Au is unchanged.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractQuantitiesOnDemand } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import type { MeshData } from '@ifc-lite/geometry';
import { loadUrbanModel, urbanWasm, wasmMeshes } from '@/test/urban-fixture';
import { layoutUrban, type UrbanLabels } from './urban-layout';
import { QuantityType } from '@ifc-lite/data';
import { collectUrbanAreas, pickArea } from './urban-models';
import { urbanIndicators } from './indicators';

const FZK = resolve(import.meta.dirname, '../../public/_fixtures/AC20-FZK-Haus.ifc');
/** Footprints come from f32 meshes and a 2D boolean: a millimetre band on a 12 m side is 0.012 m²; allow 0.05 m². */
const AREA_TOL = 0.05;
const AC_BY_HAND = 12.0 * 10.0;
const AD_BY_HAND = 2 * AC_BY_HAND;
const AU_BY_HAND = 21.410325 + 12.127619 + 12.59545 + 25.2088935 + 11.185458 + 16.30545 + 74.5092415823;

const near = (actual: number | null, expected: number, what: string) => {
  assert.ok(actual !== null, `${what} is missing`);
  assert.ok(Math.abs(actual - expected) <= AREA_TOL, `${what}: ${actual} vs ${expected} by hand`);
};

describe('urban indicators on AC20-FZK-Haus (#76)', () => {
  beforeEach(() => useViewerStore.setState({ models: new Map() }));

  it('Ac, Ad and Au agree with the computation by hand', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)));
    const areas = collectUrbanAreas();
    const result = urbanIndicators({ ...areas, siteArea: 600 });
    near(result.ac, AC_BY_HAND, 'Ac');
    near(result.ad, AD_BY_HAND, 'Ad');
    near(result.adCut, AD_BY_HAND, 'Ad for CUT');
    near(result.au, AU_BY_HAND, 'Au');
    assert.deepEqual(areas.spacesLeftOut, { external: 0, otherType: 0, parents: 0 });
    assert.deepEqual(result.zero, { elevation: 0, source: 'model' });
    assert.deepEqual(areas.assumedInterior, [], 'both storeys have a slab or rooms to tell rooms from courtyards');
    near(result.pot, (AC_BY_HAND / 600) * 100, 'POT');
    near(result.cut, AD_BY_HAND / 600, 'CUT');
    assert.deepEqual(result.storeys.map((r) => [r.name, r.ground, r.inCut, r.belowGround]), [
      ['Dachgeschoss', false, true, false], ['Erdgeschoss', true, true, false],
    ]);
    // The attic holds only the gallery; the six ground-floor rooms are the rest.
    near(result.storeys[0].usefulArea, 74.5092415823, 'Au of the attic');
  });

  it('the hand figure for Ac matches the base slab quantity the model states', async (t) => {
    if (!urbanWasm(t)) return;
    await loadUrbanModel('fzk', new Uint8Array(readFileSync(FZK)), []);
    const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
    const gross = extractQuantitiesOnDemand(store, 34509).flatMap((s) => s.quantities).find((q) => q.name === 'GrossArea');
    assert.equal(gross?.value, AC_BY_HAND);
  });
});

/** `Wand-Ext-ERDG-1`, one of the four ground-floor external walls. */
const EXT_WALL = 21966;

/** World-space copies of meshes, origin folded in, as the renderer hands out GPU-instanced pieces. */
const asPieces = (meshes: readonly MeshData[]): MeshData[] => meshes.map((m) => {
  const o = m.origin ?? [0, 0, 0];
  const positions = m.positions.map((v, i) => v + o[i % 3]);
  return { ...m, positions, origin: undefined };
});

const LABELS: UrbanLabels = {
  title: 'T', level: 'Level', elevation: 'Elevation', built: 'Built', useful: 'Useful', inCut: 'In CUT', yes: 'yes', no: 'no',
  belowGround: (n) => n, ground: (n) => n, category: 'Category', area: 'Area',
  ac: 'Ac', ad: 'Ad', adCut: 'Ad for CUT', au: 'Au', site: 'Site', pot: 'POT', cut: 'CUT', rules: () => [], note: '',
  atLeast: (v) => `>= ${v}`, unmeasured: (count, level) => `${count} unmeasured on ${level}`,
};
const texts = (r: ReturnType<typeof urbanIndicators>) => layoutUrban(r, LABELS).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
const after = (all: string[], label: string) => all[all.indexOf(label) + 1];

describe('footprint elements that are not in the flat meshes (#76)', () => {
  beforeEach(() => useViewerStore.setState({ models: new Map() }));

  it('a wall drawn by GPU instancing is measured from its instanced pieces', async (t) => {
    if (!urbanWasm(t)) return;
    const bytes = new Uint8Array(readFileSync(FZK));
    const all = wasmMeshes(bytes);
    await loadUrbanModel('fzk', bytes, all.filter((m) => m.expressId !== EXT_WALL));
    const pieces = asPieces(all.filter((m) => m.expressId === EXT_WALL));
    assert.ok(pieces.length > 0);
    const areas = collectUrbanAreas((id) => (id === EXT_WALL ? pieces : undefined));
    const result = urbanIndicators({ ...areas, siteArea: null });
    near(result.ac, AC_BY_HAND, 'Ac');
    assert.equal(result.acAtLeast, false);
    assert.deepEqual(areas.storeys.map((s) => s.unmeasured), [0, 0]);
  });

  it('a wall with no mesh anywhere is counted, and Ac / Ad print as lower bounds with a footnote', async (t) => {
    if (!urbanWasm(t)) return;
    const bytes = new Uint8Array(readFileSync(FZK));
    await loadUrbanModel('fzk', bytes, wasmMeshes(bytes).filter((m) => m.expressId !== EXT_WALL));
    const areas = collectUrbanAreas(() => undefined);
    const erdgeschoss = areas.storeys.find((s) => s.name === 'Erdgeschoss')!;
    assert.equal(erdgeschoss.unmeasured, 1);
    const result = urbanIndicators({ ...areas, siteArea: 600 });
    assert.equal(result.acAtLeast, true);
    assert.equal(result.adAtLeast, true);
    const printed = texts(result);
    assert.ok(printed.includes('1 unmeasured on Erdgeschoss'), printed.join(' | '));
    for (const label of ['Ac', 'Ad', 'Ad for CUT', 'POT', 'CUT']) assert.match(after(printed, label), /^>= /, label);
    assert.equal(after(printed, 'Erdgeschoss'), '±0.00', 'the elevation is a plain figure');
    assert.match(printed[printed.indexOf('Erdgeschoss') + 2], /^>= /, 'the level\'s built area is marked');
    assert.doesNotMatch(printed[printed.indexOf('Dachgeschoss') + 2], /^>= /, 'the attic was measured whole');
  });
});

describe('measuring once per state (review of #111)', () => {
  beforeEach(() => useViewerStore.setState({ models: new Map() }));

  // Each table showing the indicators (its tab, each sheet it is placed on) measured the meshes again.
  it('measures again only when the models, an edit or the levels change', async (t) => {
    if (!urbanWasm(t)) return;
    const bytes = new Uint8Array(readFileSync(FZK));
    const all = wasmMeshes(bytes);
    await loadUrbanModel('fzk', bytes, all.filter((m) => m.expressId !== EXT_WALL));
    const pieces = asPieces(all.filter((m) => m.expressId === EXT_WALL));
    let asked = 0;
    const instanced = (id: number) => { if (id === EXT_WALL) asked++; return id === EXT_WALL ? pieces : undefined; };
    const first = collectUrbanAreas(instanced);
    assert.equal(asked, 1);
    assert.equal(collectUrbanAreas(instanced), first, 'the same state gives the same measure');
    assert.equal(asked, 1, 'and does not measure again');
    useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });
    collectUrbanAreas(instanced);
    assert.equal(asked, 2, 'an edit measures again');
    useProjectStore.setState({ levels: [...useProjectStore.getState().levels] });
    collectUrbanAreas(instanced);
    assert.equal(asked, 3, 'new levels measure again');
  });
});

describe('room areas from quantity sets (#76)', () => {
  const set = (name: string, quantities: [string, number][]) => ({ name, quantities: quantities.map(([n, value]) => ({ name: n, type: QuantityType.Area, value })) });
  const NAMES = ['NetFloorArea', 'GrossFloorArea'];

  it('takes NetFloorArea, falls back to GrossFloorArea, prefers the standard set, and scales to SI', () => {
    assert.equal(pickArea([set('BaseQuantities', [['GrossFloorArea', 12], ['NetFloorArea', 11]])], 'Qto_SpaceBaseQuantities', NAMES, 1), 11);
    assert.equal(pickArea([set('BaseQuantities', [['GrossFloorArea', 12]])], 'Qto_SpaceBaseQuantities', NAMES, 1), 12);
    assert.equal(pickArea([set('Other', [['NetFloorArea', 9]]), set('Qto_SpaceBaseQuantities', [['NetFloorArea', 10]])], 'Qto_SpaceBaseQuantities', NAMES, 1), 10);
    assert.equal(pickArea([set('Qto_SpaceBaseQuantities', [['NetFloorArea', 10e6]])], 'Qto_SpaceBaseQuantities', NAMES, 1e-6), 10);
    assert.equal(pickArea([set('Qto_SpaceBaseQuantities', [['NetCeilingArea', 10]])], 'Qto_SpaceBaseQuantities', NAMES, 1), null);
  });
});
