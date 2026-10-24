/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #256: the live floor-plan command cuts a storey where the SHEET plan does
 * (`defaultPlanCutHeight`, #234), not at a plain floor + 1.2 m. The storeys are
 * those of #234's `plan-cut-below-next-slab.ifc` (Lower 0.0 m, Upper 1.0 m);
 * the rule gives Lower min(1.2, max(1.0 - 0.5, 1.0 / 2)) = exactly 0.5 m, the
 * top storey exactly 1.2 m, and ordinary 3 m storeys exactly 1.2 m.
 */
import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { percentToWorld } from '@/lib/section/section-distance';
import { useSectionDistance, type SectionDistance } from '@/components/viewer/tools/useSectionDistance';
import { fixtureStoreys, sheetCutHeights } from '@/test/close-storeys-fixture.js';
import { useFloorplanView } from './useFloorplanView.js';

type Storey = { expressId: number; modelId: string; name: string; elevation: number };

const RANGE = { min: -1, max: 4 };

function loadModel(elevations: readonly number[]): Storey[] {
  const shiftedBounds = { min: { x: 0, y: RANGE.min, z: 0 }, max: { x: 10, y: RANGE.max, z: 10 } };
  const coordinateInfo = { originShift: { x: 0, y: 0, z: 0 }, originalBounds: shiftedBounds, shiftedBounds, hasLargeCoordinates: false };
  const storeys = elevations.map((elevation, i): Storey => ({ expressId: i + 1, modelId: 'm', name: `S${i}`, elevation }));
  const ifcDataStore = {
    spatialHierarchy: {
      byStorey: new Map(storeys.map((s) => [s.expressId, []])),
      storeyElevations: new Map(storeys.map((s) => [s.expressId, s.elevation])),
    },
    entities: { getName: (id: number) => `S${id - 1}` },
  };
  useViewerStore.setState({
    activeTool: 'select', drawing2DPanelVisible: false, ifcDataStore: null, geometryResult: null,
    models: new Map([['m', { visible: true, geometryResult: { coordinateInfo }, ifcDataStore }]]) as never,
    sectionPlane: { ...useViewerStore.getState().sectionPlane, axis: 'down', position: 50, enabled: false, custom: undefined },
  });
  return storeys;
}

let activate: ((storey: Storey) => void) | null = null;
let distance: SectionDistance | null = null;
function Probe() {
  activate = useFloorplanView().activateFloorplan;
  distance = useSectionDistance();
  return null;
}
const mount = (elevations: readonly number[]): Storey[] => { const s = loadModel(elevations); render(<Probe />); return s; };
afterEach(() => { cleanup(); activate = null; distance = null; });

const metres = () => percentToWorld(useViewerStore.getState().sectionPlane.position, RANGE);

describe('the floor-plan command and the storey menu cut like the sheet plan (#256)', () => {
  it('a storey 1.0 m below the next is cut at exactly 0.5 m above its floor', () => {
    const fixture = fixtureStoreys();
    const sheet = sheetCutHeights();
    assert.equal(sheet.Lower, 0.5, 'the sheet plan');
    const [lower, upper] = mount(fixture.map((s) => s.elevation));
    act(() => activate!(lower));
    assert.ok(Math.abs(metres() - 0.5) < 1e-9, `floor-plan command: ${metres()} m`);
    assert.ok(Math.abs(metres() - (lower.elevation + sheet.Lower)) < 1e-9);
    act(() => activate!(upper));
    assert.ok(Math.abs(metres() - 2.2) < 1e-9, `top storey: ${metres()} m`);
    act(() => distance!.cutAtStorey(lower));
    assert.ok(Math.abs(metres() - 0.5) < 1e-9, `Section bar menu: ${metres()} m`);
  });

  it('the Section bar scrub snaps sit at the same cuts', () => {
    mount([0, 1]);
    assert.deepEqual(distance!.snaps.map((v) => Math.round(v * 1e9) / 1e9).sort((a, b) => a - b), [0.5, 2.2]);
  });

  it('the Duplex T/FDN storey (-1.25 m, Level 1 at 0.0 m) is cut at -0.5 m', () => {
    const [fdn] = mount([-1.25, 0]);
    act(() => activate!(fdn));
    assert.ok(Math.abs(metres() + 0.5) < 1e-9, `got ${metres()}`);
  });

  it('storeys 3 m apart stay at exactly 1.2 m', () => {
    const [ground, first] = mount([0, 3]);
    act(() => activate!(ground));
    assert.ok(Math.abs(metres() - 1.2) < 1e-9);
    act(() => distance!.cutAtStorey(first));
    assert.ok(Math.abs(metres() - 4.2) < 1e-9);
  });
});
