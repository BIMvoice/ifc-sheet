/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #232: a storey's plan cut above (or below) the model keeps its real height
 * in the live 3D view, like the sheet plan. On the top storey of a model whose
 * top is lower than floor + 1.2 m the floor-plan command used to clamp the
 * plane onto the model's top face, so the 3D view cut through the roof slab
 * while the sheet showed nothing cut. The slider spans the model widened to
 * the plane it holds and still clamps at the ends of that span.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { percentToWorld, worldToPercent } from '@/lib/section/section-distance';
import { loadLastSectionMode } from '@/store/slices/sectionLastMode';
import { useSectionDistance, type SectionDistance } from '@/components/viewer/tools/useSectionDistance';
import { useFloorplanView } from './useFloorplanView.js';

type Storey = { expressId: number; modelId: string; name: string; elevation: number };

// The tested_sample_project shape: the model spans y 0..3.3 m, "Nivel 2" stands at 3.0 m, so its 1.2 m plan cut is 4.2 m, above the top.
const RANGE = { min: 0, max: 3.3 };
const NIVEL_2: Storey = { expressId: 2, modelId: 'm', name: 'Nivel 2', elevation: 3.0 };
const NIVEL_1: Storey = { expressId: 1, modelId: 'm', name: 'Nivel 1', elevation: 0 };

function loadModel() {
  const shiftedBounds = { min: { x: 0, y: RANGE.min, z: 0 }, max: { x: 10, y: RANGE.max, z: 10 } };
  const coordinateInfo = { originShift: { x: 0, y: 0, z: 0 }, originalBounds: shiftedBounds, shiftedBounds, hasLargeCoordinates: false };
  useViewerStore.setState({
    activeTool: 'select', drawing2DPanelVisible: false, ifcDataStore: null, geometryResult: null,
    models: new Map([['m', { visible: true, geometryResult: { coordinateInfo } }]]) as never,
    sectionPlane: { ...useViewerStore.getState().sectionPlane, axis: 'down', position: 50, enabled: false, custom: undefined },
  });
}

let activate: ((storey: Storey) => void) | null = null;
let distance: SectionDistance | null = null;
function Probe() {
  activate = useFloorplanView().activateFloorplan;
  distance = useSectionDistance();
  return null;
}

beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } loadModel(); render(<Probe />); });
afterEach(() => { cleanup(); activate = null; distance = null; });

const plane = () => useViewerStore.getState().sectionPlane;
const metres = () => percentToWorld(plane().position, RANGE);

describe('floor-plan command', () => {
  it('places the plane at a cut above the model top, not on its top face', () => {
    act(() => activate!(NIVEL_2));
    assert.ok(plane().position > 100, `position ${plane().position} stays past the model top`);
    assert.ok(Math.abs(metres() - 4.2) < 1e-9, `the plane stands at 4.2 m, got ${metres()}`);
    assert.equal(plane().position, worldToPercent(4.2, RANGE), 'the same conversion the sheet plan uses');
  });

  it('places the plane at a cut below the model bottom', () => {
    act(() => activate!({ ...NIVEL_1, elevation: -5 }));
    assert.ok(plane().position < 0);
    assert.ok(Math.abs(metres() + 3.8) < 1e-9, `got ${metres()}`);
  });

  it('leaves a normal storey exactly where it was', () => {
    act(() => activate!(NIVEL_1));
    assert.equal(plane().position, (1.2 / 3.3) * 100);
    assert.ok(Math.abs(metres() - 1.2) < 1e-9);
  });

  it('survives the Section panel restoring its last mode on mount', () => {
    act(() => activate!(NIVEL_2));
    const mode = loadLastSectionMode();
    assert.equal(mode.kind, 'cardinal');
    assert.equal(mode.kind === 'cardinal' && mode.position, plane().position, 'the persisted mode keeps the position beyond 100');
  });
});

describe('Section slider', () => {
  it('keeps the model span while the plane is inside it', () => {
    act(() => activate!(NIVEL_1));
    assert.equal(distance!.min, RANGE.min);
    assert.equal(distance!.max, RANGE.max);
  });

  it('widens its span to hold a plane above the model', () => {
    act(() => activate!(NIVEL_2));
    assert.equal(distance!.min, RANGE.min);
    assert.ok(Math.abs(distance!.max - 4.2) < 1e-9, `max ${distance!.max}`);
    assert.ok(Math.abs(distance!.value - 4.2) < 1e-9, 'the field shows the real height');
  });

  it('a storey picked from the Section bar menu cuts at its real height too', () => {
    act(() => distance!.cutAtStorey(NIVEL_2));
    assert.ok(Math.abs(metres() - 4.2) < 1e-9);
  });

  it('still clamps a drag to the span', () => {
    act(() => activate!(NIVEL_1));
    act(() => distance!.onChange(99));
    assert.equal(plane().position, 100, 'inside the model the top of the span is the model top');
    act(() => distance!.onChange(-99));
    assert.equal(plane().position, 0);
  });

  it('a drag from a plane above the model cannot push it further out', () => {
    act(() => activate!(NIVEL_2));
    act(() => distance!.onChange(99));
    assert.ok(Math.abs(metres() - 4.2) < 1e-9, `clamped to the held plane, got ${metres()}`);
    act(() => distance!.onChange(3.0));
    assert.ok(Math.abs(metres() - 3.0) < 1e-9, 'a drag back inside lands exactly');
  });
});

describe('API entry', () => {
  it('setSectionPlanePosition still clamps to 0..100', () => {
    act(() => useViewerStore.getState().setSectionPlanePosition(150));
    assert.equal(plane().position, 100);
    act(() => useViewerStore.getState().setSectionPlanePosition(-5));
    assert.equal(plane().position, 0);
  });
});
