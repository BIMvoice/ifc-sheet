/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A wall over a wide opening, cut by a plan: the part above the opening is overhead, and its outline must come out
 * dashed, never as a solid line across the room below.
 *
 * Found on the skolebygg sample (QA, 2026-11-26): on Plan 02 a folding-wall opening (IfcWallStandardCase
 * 1uxIuVLVrB_gwNX$qzDdR_) and a glazed wall (00_W9xoqb05PPDE73B2ftL) printed solid lines 9 to 21 m long through the
 * rooms. The overhead piece of each wall (clipped to the band above the cut) has its lowest vertex ON the cut plane,
 * and the Rust outline reads it back in f32: 136.39999 for a 136.4 cut, 6 micrometres below it. Classified by that
 * axis range the piece "spans" the cut and its contour was drawn solid.
 *
 * The invariant: a piece clipped to the band above the cut draws only dashed lines (`visibility: 'hidden'`), and a
 * piece clipped to the band below draws only solid ones, whatever rounding the outline's own axis range carries.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';

const wasmPath = new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url);

/** Boxes as one mesh of one element, at absolute coordinates (y up). */
function boxes(expressId: number, list: Array<[[number, number, number], [number, number, number]]>): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  const faces = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  for (const [[a, b, c], [x, y, z]] of list) {
    const base = positions.length / 3;
    positions.push(a, b, c, x, b, c, x, y, c, a, y, c, a, b, z, x, b, z, x, y, z, a, y, z);
    indices.push(...faces.map((i) => i + base));
  }
  return {
    expressId, ifcType: 'IfcWallStandardCase', modelIndex: 0, color: [1, 1, 1, 1],
    positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices),
  };
}

async function planOf(meshes: MeshData[], cut: number) {
  const wasm = await import('../../wasm/pkg/ifc-lite.js');
  wasm.initSync({ module: readFileSync(wasmPath) });
  const generator = new Drawing2DGenerator();
  try {
    return await generator.generate(meshes, {
      plane: { axis: 'y', position: cut, flipped: false }, projectionDepth: 1.2, projectionBelowDepth: 1.2, projectionAboveDepth: 2.067,
      clipProjectionBands: true, includeHiddenLines: true, creaseAngle: 30, scale: 100,
    }, {
      useGPU: false, includeHiddenLines: true, includeProjection: true, includeEdges: true, mergeLines: true,
      outlineProvider(mesh, axis, flipped) {
        const handle = wasm.meshOutline2d(mesh.positions, mesh.indices, axis === 'y' ? 1 : axis === 'z' ? 2 : 0, flipped);
        if (!handle) return null;
        try {
          const contours: Float32Array[] = [];
          for (let i = 0; i < handle.contourCount; i++) {
            const ring = handle.contour(i);
            if (ring) contours.push(ring.slice());
          }
          return { contours, axisMin: handle.axisMin, axisMax: handle.axisMax };
        } finally { handle.free(); }
      },
    });
  } finally { generator.dispose(); }
}

describe('overhead band outline (skolebygg Plan 02, 2026-11-26)', () => {
  it.skipIf(!existsSync(wasmPath))('draws the wall over a 9.6 m opening dashed, not as a solid line across the room', async () => {
    // Storey floor at 135.2 m, plan cut 1.2 m above it: the heights the skolebygg sample is meshed at.
    const floor = 135.2, cut = 136.4;
    const wall = boxes(421473, [
      [[0, floor, 0], [0.2, 138.9, 0.2]], // the post at one end
      [[9.8, floor, 0], [10, 138.9, 0.2]], // the post at the other
      [[0.2, 137.7, 0], [9.8, 138.9, 0.2]], // the wall over the opening, above the cut
    ]);
    const drawing = await planOf([wall], cut);
    const across = drawing.lines.filter((l) => l.category === 'projection'
      && Math.min(l.line.start.x, l.line.end.x) < 9 && Math.max(l.line.start.x, l.line.end.x) > 1);
    // The opening's head is drawn (dashed): the test would pass vacuously without it.
    expect(across.length).toBeGreaterThan(0);
    expect(across.filter((l) => l.visibility === 'visible').map((l) => l.line)).toEqual([]);
    // The posts below the cut keep their solid outline.
    expect(drawing.lines.some((l) => l.category === 'projection' && l.visibility === 'visible' && l.line.start.x <= 0.2 && l.line.end.x <= 0.2)).toBe(true);
  });
});
