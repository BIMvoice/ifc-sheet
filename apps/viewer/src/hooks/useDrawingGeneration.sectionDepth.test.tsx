/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section made from a line on a plan (a custom vertical plane) must draw
 * what lies beyond the cut, as far as the view's depth setting reaches, and
 * nothing in front of the cut. Drives the real hook.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import type { TypeVisibilityGate } from '@/store/typeVisibilityFilter';
import type { SectionPlane } from '@/store';
import { useDrawingGeneration } from './useDrawingGeneration.js';

function box(expressId: number, min: [number, number, number], max: [number, number, number]): MeshData {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { expressId, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [0.5, 0.5, 0.5, 1], geometryClass: 0 };
}

// Plane x = 0 through the middle of a 10 m model, looking toward -x.
const CUT = 1, BEHIND = 2, FRONT = 3;
const geometryResult: GeometryResult = {
  meshes: [
    box(CUT, [-0.1, 0, -2], [0.1, 3, 2]),
    box(BEHIND, [-2.2, 0, -2], [-2, 3, 2]),
    box(FRONT, [2, 0, -2], [2.2, 3, 2]),
  ],
  totalTriangles: 36,
  totalVertices: 24,
  coordinateInfo: {
    originShift: { x: 0, y: 0, z: 0 },
    originalBounds: { min: { x: -5, y: 0, z: -2 }, max: { x: 5, y: 3, z: 2 } },
    shiftedBounds: { min: { x: -5, y: 0, z: -2 }, max: { x: 5, y: 3, z: 2 } },
    hasLargeCoordinates: false,
  },
} as GeometryResult;

const GATE: TypeVisibilityGate = { spaces: true, spatialZones: true, openings: true, virtualElements: true, site: true, ifcAnnotations: true };

function plane(flipped: boolean): SectionPlane {
  return {
    axis: 'side', position: 50, mode: 'section', flipped, enabled: true,
    custom: { normal: [1, 0, 0], distance: 0, pickedAt: [0, 1.5, 0], tangent: [0, 0, -1], bitangent: [0, 1, 0] },
  } as unknown as SectionPlane;
}

async function projected(depth: number, flipped = false): Promise<Set<number>> {
  let drawing: Drawing2D | null = null;
  let run: (() => Promise<void>) | null = null;
  function Harness(): null {
    const { generateDrawing } = useDrawingGeneration({
      activeTool: 'select',
      geometryResult,
      ifcDataStore: null,
      sectionPlane: plane(flipped),
      displayOptions: {
        showHiddenLines: false, useSymbolicRepresentations: false, show3DOverlay: false, scale: 50,
        showConstructionProjection: true, constructionProjectionDepth: depth,
      },
      typeVisibility: GATE,
      combinedHiddenIds: new Set<number>(),
      combinedIsolatedIds: null,
      computedIsolatedIds: null,
      models: new Map([['m0', { id: 'm0', visible: true }]]),
      panelVisible: false,
      drawing: null,
      setDrawing: (d) => { drawing = d; },
      setDrawingStatus: () => {},
      setDrawingProgress: () => {},
      setDrawingError: () => {},
    });
    run = generateDrawing;
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  try {
    root = createRoot(container);
    await act(async () => { root!.render(<Harness />); });
    assert.ok(run, 'harness never rendered');
    await act(async () => { await run!(); });
    const d = drawing as Drawing2D | null;
    assert.ok(d, 'no drawing was produced');
    assert.ok(d.lines.some((l) => l.category === 'cut'), 'the cut itself must be drawn');
    return new Set(d.lines.filter((l) => l.category !== 'cut').map((l) => l.entityId));
  } finally {
    if (root) await act(async () => { root!.unmount(); });
    container.remove();
  }
}

describe('section from a plan line: depth beyond the cut', () => {
  it('draws the wall behind the cut when the depth reaches it', async () => {
    assert.ok((await projected(3)).has(BEHIND));
  });
  it('leaves it out when the depth stops short, and brings it in as the depth grows', async () => {
    assert.ok(!(await projected(0.5)).has(BEHIND));
    assert.ok((await projected(8)).has(BEHIND));
  });
  it('never draws what is in front of the cut', async () => {
    assert.ok(!(await projected(8)).has(FRONT));
  });
  it('a flipped section looks the other way', async () => {
    const f = await projected(3, true);
    assert.ok(f.has(FRONT));
    assert.ok(!f.has(BEHIND));
  });
});
