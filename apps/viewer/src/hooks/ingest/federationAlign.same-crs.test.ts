/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two models in one projected CRS align by their map conversions alone.
 *
 * The BIMcollab Architecture + Structural pair both state EPSG:32760 with no
 * IfcProjectedCRS.VerticalDatum. Adding the second to the first failed with
 * "EPSG:32760 → EPSG:32760 reprojection failed": the same-CRS placement
 * refused the pair as 'vertical-crs-unknown', though neither model states a
 * datum and so both state their heights the same way.
 *
 * The invariant checked: after alignment a vertex sits, in the anchor's frame,
 * at the same projected East/North/height its source map conversion gave it.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';

import type { MapConversion, ProjectedCRS } from '@ifc-lite/parser';
import { localViewerToProjected, type GeometryResult, type MeshData } from '@ifc-lite/geometry';
import { alignGeometryToReference, type ModelSpatialPlacement } from './federationAlign.js';
import { spatialReferenceFromIfc } from '../../lib/geo/ifc-spatial-reference.js';

function placement(crs: string, conversion: Partial<MapConversion>, verticalDatum?: string): ModelSpatialPlacement {
  const mapConversion: MapConversion = {
    id: 1, sourceCRS: 2, targetCRS: 3,
    eastings: 0, northings: 0, orthogonalHeight: 0, xAxisAbscissa: 1, xAxisOrdinate: 0, scale: 1,
    ...conversion,
  };
  const projectedCRS = { id: 4, name: crs, mapUnitScale: 1, ...(verticalDatum ? { verticalDatum } : {}) } as ProjectedCRS;
  return { spatialReference: spatialReferenceFromIfc({ mapConversion, projectedCRS, lengthUnitScale: 1 }) };
}

/** The BIMcollab pair's conversion, in metres: 60° grid rotation, 1.3 m height. */
const BIMCOLLAB = { eastings: 729013.3488297004, northings: 9063992.684697364, orthogonalHeight: 1.3, xAxisAbscissa: 0.5, xAxisOrdinate: 0.8660254037844387 };

const SOURCE_POINTS: Array<[number, number, number]> = [[0, 0, 0], [12, 3, -7.5], [-4, 0.2, 9]];

function geometry(): GeometryResult {
  return {
    meshes: [{
      expressId: 1,
      positions: new Float32Array(SOURCE_POINTS.flat()),
      normals: new Float32Array(SOURCE_POINTS.length * 3),
      indices: new Uint32Array([0, 1, 2]),
      color: [1, 1, 1, 1],
    } as MeshData],
    totalTriangles: 1,
    totalVertices: SOURCE_POINTS.length,
    coordinateInfo: {
      originShift: { x: 0, y: 0, z: 0 },
      originalBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
      hasLargeCoordinates: false,
    },
  };
}

/** Largest projected distance, in metres, between each source point and where it landed. */
function worstProjectedGap(geom: GeometryResult, source: ModelSpatialPlacement, reference: ModelSpatialPlacement): number {
  const mesh = geom.meshes[0];
  const o = mesh.origin ?? [0, 0, 0];
  let worst = 0;
  SOURCE_POINTS.forEach((point, index) => {
    const aligned: [number, number, number] = [0, 1, 2].map((axis) => mesh.positions[index * 3 + axis] + o[axis]) as [number, number, number];
    const want = localViewerToProjected(source.spatialReference, point)!;
    const got = localViewerToProjected(reference.spatialReference, aligned)!;
    worst = Math.max(worst, Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]));
  });
  return worst;
}

describe('federation alignment in one projected CRS', () => {
  it('aligns two EPSG:32760 models without a vertical datum by their map conversions', async () => {
    const reference = placement('EPSG:32760', BIMCOLLAB);
    const source = placement('EPSG:32760', { ...BIMCOLLAB, eastings: BIMCOLLAB.eastings + 10, northings: BIMCOLLAB.northings - 4, orthogonalHeight: 2.5 });
    const geom = geometry();
    assert.equal(await alignGeometryToReference(geom, source, reference), 'same-crs');
    assert.ok(worstProjectedGap(geom, source, reference) < 1e-3, 'every vertex lands where its map conversion places it');
  });

  it('leaves the BIMcollab pair, one conversion for both, exactly where it is', async () => {
    const geom = geometry();
    const status = await alignGeometryToReference(geom, placement('EPSG:32760', BIMCOLLAB), placement('EPSG:32760', BIMCOLLAB));
    assert.equal(status, 'identity');
    assert.deepEqual([...geom.meshes[0].positions], SOURCE_POINTS.flat().map(Math.fround));
  });

  it('still refuses one CRS when only one model states a vertical datum', async () => {
    const status = await alignGeometryToReference(geometry(), placement('EPSG:32760', BIMCOLLAB, 'EPSG:5729'), placement('EPSG:32760', BIMCOLLAB));
    assert.equal(status, 'failed');
  });
});

describe('federation alignment across CRSs when one has no projection definition', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('places the model by its map conversion and says so', async () => {
    // No network in a test: the epsg.io fallback must find nothing either.
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    const reference = placement('EPSG:32760', BIMCOLLAB);
    const source = placement('EPSG:999999', { ...BIMCOLLAB, eastings: BIMCOLLAB.eastings + 10 });
    const geom = geometry();
    assert.equal(await alignGeometryToReference(geom, source, reference), 'map-conversion');
    assert.ok(worstProjectedGap(geom, source, reference) < 1e-3, 'placed by the map conversion as if in the anchor CRS');
  });
});
