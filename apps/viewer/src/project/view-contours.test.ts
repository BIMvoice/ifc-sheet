/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The site plan of a LandXML model draws its terrain as contours, not as the one mesh cut at the plan's height (#182):
 * the sample `terrain-tin-metric.xml` through the app's own surface mesher (`buildLandXmlSurfaceMesh`), the view's drawing
 * and the sheet's pens (`viewportPens`), which the PDF and the DXF are written from.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSectionConfig, type Drawing2D, type DrawingLine } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { buildLandXmlSurfaceMesh } from '@/hooks/ingest/landXmlIngest';
import type { LandXmlTinSurface } from '@/hooks/ingest/landXmlSemantics';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { terrainMeshes, withViewContours, type TerrainSource } from './view-contours';
import type { PlanProjectView } from './types';

const SAMPLE = fileURLToPath(new URL('../../public/samples/terrain-tin-metric.xml', import.meta.url));
const missing = existsSync(SAMPLE) ? false : 'terrain-tin-metric.xml is missing: run pnpm fixtures';

/** The sample's TIN as the viewer meshes it: the surface read from the file's points and faces, units already metres. */
function sampleMesh(): MeshData {
  const xml = readFileSync(SAMPLE, 'utf8');
  const points = [...xml.matchAll(/<P id="([^"]+)">\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*<\/P>/g)].map((m) => ({ sourceId: m[1], id: m[1], northing: Number(m[2]), easting: Number(m[3]), elevation: Number(m[4]) }));
  const faces = [...xml.matchAll(/<F>\s*(\S+)\s+(\S+)\s+(\S+)\s*<\/F>/g)].map((m) => [m[1], m[2], m[3]] as const);
  const surface: LandXmlTinSurface = {
    sourceId: 's', ordinal: 1, sourcePath: 'LandXML/Surfaces/Surface[1]', properties: {}, definitionProperties: {}, name: 'Synthetic_Terrain', kind: 'tin', renderState: 'rendered',
    points, sourceDataPoints: [], faces, faceSourceIds: faces.map((_, i) => `f${i}`), faceVisibility: faces.map(() => true), hiddenFaceCount: 0, boundaries: [], breaklines: [], contours: [],
  };
  const { mesh } = buildLandXmlSurfaceMesh(surface, 1, 1, 1);
  assert.ok(mesh);
  return mesh;
}

const line = (x: number): DrawingLine => ({ line: { start: { x, y: 0 }, end: { x: x + 1, y: 1 } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'Unknown', modelIndex: 0, depth: 0 });
/** What the generator makes of a terrain-only model's plan: the TIN cut at half its height, one line, in the TIN's own frame. */
const halfCut = (): Drawing2D => ({
  config: createSectionConfig('y', 1.5), lines: [line(0)], cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
  stats: { cutLineCount: 1, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
});
const plan = (extra: Partial<PlanProjectView> = {}): PlanProjectView => ({
  id: 'p', name: 'Site plan', createdAt: 0, kind: 'plan', level: { name: 'Plan', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.5, site: true, ...extra,
});
const sources = (mesh: MeshData): ReadonlyMap<string, TerrainSource> => new Map([['terrain', { landXmlDocument: {}, geometryResult: { meshes: [mesh] } }]]);
const pensOf = (d: Drawing2D) => viewportPens(d, undefined, { scale: 1000, x: 0, y: 0 }, 'down', []);
const strokes = (d: Drawing2D): number => pensOf(d).reduce((n, p) => n + (p.d.match(/M/g)?.length ?? 0), 0);

describe('a LandXML model on a site plan (#182)', () => {
  it('finds the terrain among the loaded models: a LandXML model, and any geographic element', { skip: missing }, () => {
    const mesh = sampleMesh();
    assert.deepEqual(terrainMeshes(sources(mesh), undefined), [mesh]);
    const typed = { ...mesh, ifcType: 'IfcGeographicElement' };
    assert.deepEqual(terrainMeshes(new Map(), [typed, { ...mesh, ifcType: 'IfcWall' }]), [typed]);
  });

  it('draws contours in place of the half-height cut, on the sheet pens', { skip: missing }, () => {
    const mesh = sampleMesh();
    const raw = halfCut();
    const drawn = withViewContours(raw, plan(), sources(mesh), { meshes: [mesh] });
    assert.notEqual(drawn, raw);
    assert.equal(drawn.lines.some((l) => l.ifcType === 'Unknown'), false, 'the mesh cut is gone');
    assert.ok(strokes(drawn) > 1, 'contours are drawn');
    // 100.5 .. 103.0 at 0.5 m: six levels, drawn as segments in the TIN's own frame (x east, y the drawing's north).
    const widths = new Set(pensOf(drawn).filter((p) => p.stroke).map((p) => p.width));
    assert.equal(widths.size, 2, 'a minor and a heavier major pen');
  });

  it('changes with the interval, and not at all for a plan that takes none', { skip: missing }, () => {
    const mesh = sampleMesh();
    const at = (view: PlanProjectView) => withViewContours(halfCut(), view, sources(mesh), { meshes: [mesh] });
    assert.ok(strokes(at(plan({ contourInterval: 0.25 }))) > strokes(at(plan({ contourInterval: 1 }))));
    const storey = plan({ site: undefined, level: { name: 'Ground', elevation: 0, storeyGlobalIds: ['g'] } });
    const raw = halfCut();
    assert.equal(withViewContours(raw, storey, sources(mesh), { meshes: [mesh] }), raw);
  });
});
