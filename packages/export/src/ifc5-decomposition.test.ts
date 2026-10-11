/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The IFC5 tree filter must follow decomposition, not containment alone
 * (#4841).
 *
 * An element that hangs off its parent by `IfcRelAggregates` is contained in
 * no spatial structure, so the pre-fix `buildTreeEntitySet` never reached it:
 * `onlyTreeEntities` defaults to `true`, so the DEFAULT export dropped the
 * element and its geometry while keeping the aggregating parent as a node
 * with nothing under it. Turning the filter off was not a fix — it recovers
 * the parts and emits every type object and relationship alongside them.
 *
 * Every assertion below therefore runs on the DEFAULT options, and
 * reachability is asserted by walking `children` from the document root:
 * membership in `data` is not reachability, and an aggregated part that is
 * emitted but that nothing lists as a child is still a broken document.
 */

import { describe, it, expect } from 'vitest';
import { EMPTY_SOURCE_BYTES, IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { MutablePropertyView, type IfcAttributeValue } from '@ifc-lite/mutations';
import {
  StringTable,
  EntityTableBuilder,
  PropertyTableBuilder,
  QuantityTableBuilder,
  RelationshipGraphBuilder,
  RelationshipType,
} from '@ifc-lite/data';
import { Ifc5Exporter } from './ifc5-exporter.js';

/** 22-char synthetic GlobalId, unique per `n` (same convention as the other export tests). */
const guid = (n: number): string => `0GUID${String(n).padStart(17, '0')}`;

/** Path of the synthetic document-root node — `generateUuid(0)`, module-private in the exporter. */
const DOCUMENT_ROOT_PATH = '00000000-0000-4000-8000-000000000000';

interface IfcxNodeLike {
  path: string;
  children?: Record<string, string | null>;
  attributes?: Record<string, unknown>;
}

interface IfcxFileLike {
  data: IfcxNodeLike[];
}

function step(body: string): string {
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('decomposition.ifc','2024-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#6=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#10=IFCPROJECT('${guid(10)}',$,'Project',$,$,'Project',$,(#6),#5);
#20=IFCSITE('${guid(20)}',$,'Site',$,$,#3,$,$,.ELEMENT.,$,$,0.,$,$);
#30=IFCBUILDING('${guid(30)}',$,'Building',$,$,#3,$,'Building',.ELEMENT.,$,$,$);
#40=IFCBUILDINGSTOREY('${guid(40)}',$,'Storey',$,$,#3,$,'Storey',.ELEMENT.,0.);
#80=IFCRELAGGREGATES('${guid(80)}',$,$,$,#10,(#20));
#81=IFCRELAGGREGATES('${guid(81)}',$,$,$,#20,(#30));
#82=IFCRELAGGREGATES('${guid(82)}',$,$,$,#30,(#40));
${body}
ENDSEC;
END-ISO-10303-21;`;
}

/**
 * The shape the issue measured: an `IfcRoof` contained in the storey, whose
 * two `IfcSlab` parts are contained in nothing and reachable only through
 * `IfcRelAggregates`. The `IfcWallType` and its `IfcRelDefinesByType` are
 * here so a "fix" that merely stopped filtering would be visible as those
 * reappearing.
 */
const ROOF_MODEL = step(`#50=IFCROOF('${guid(50)}',$,'Roof',$,$,#3,$,'Roof',$);
#60=IFCSLAB('${guid(60)}',$,'Roof Slab A',$,$,#3,$,'SlabA',.ROOF.);
#61=IFCSLAB('${guid(61)}',$,'Roof Slab B',$,$,#3,$,'SlabB',.ROOF.);
#55=IFCWALL('${guid(55)}',$,'Wall',$,$,#3,$,'Wall',.NOTDEFINED.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50,#55),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#50,(#60,#61));
#90=IFCWALLTYPE('${guid(90)}',$,'WallType',$,$,$,$,$,$,.NOTDEFINED.);
#91=IFCRELDEFINESBYTYPE('${guid(91)}',$,$,$,(#55),#90);`);

async function parse(model: string): Promise<IfcDataStore> {
  return new IfcParser().parseColumnar(new TextEncoder().encode(model).buffer);
}

function mesh(expressId: number): MeshData {
  return {
    expressId,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    color: [0.8, 0.6, 0.4, 1],
  };
}

function geometryOf(...expressIds: number[]): GeometryResult {
  const meshes = expressIds.map(mesh);
  const min = { x: 0, y: 0, z: 0 };
  const max = { x: 1, y: 1, z: 1 };
  return {
    meshes,
    totalTriangles: meshes.length,
    totalVertices: meshes.length * 3,
    coordinateInfo: {
      originShift: { x: 0, y: 0, z: 0 },
      originalBounds: { min, max },
      shiftedBounds: { min, max },
      hasLargeCoordinates: false,
    },
  };
}

/** Every path actually reachable from the document root via `children`. */
function reachablePaths(file: IfcxFileLike): Set<string> {
  const byPath = new Map(file.data.map((n) => [n.path, n]));
  const reached = new Set<string>();
  const queue: string[] = byPath.has(DOCUMENT_ROOT_PATH) ? [DOCUMENT_ROOT_PATH] : [];
  while (queue.length > 0) {
    const path = queue.shift() as string;
    if (reached.has(path)) continue;
    reached.add(path);
    for (const child of Object.values(byPath.get(path)?.children ?? {})) {
      if (child) queue.push(child);
    }
  }
  return reached;
}

function nodeNamed(file: IfcxFileLike, name: string): IfcxNodeLike | undefined {
  return file.data.find((n) => n.attributes?.['bsi::ifc::prop::Name'] === name);
}

/**
 * The roof model with no source bytes: Site #20 and Storey #40 both name Roof
 * #50 as contained (a parse that attributes an element to every level above
 * it), and the Roof aggregates Slab #60. Shaped like a server parse — entity
 * table, `byId` index and relationship graph populated, `source.byteLength
 * === 0` and therefore no STEP line to re-read, which is a supported store
 * state rather than a degenerate one (`serverDataModel.ts`).
 */
function sourcelessRoofStore(): IfcDataStore {
  const strings = new StringTable();
  const entityBuilder = new EntityTableBuilder(6, strings);
  entityBuilder.add(10, 'IFCPROJECT', guid(10), 'Project', '', '');
  entityBuilder.add(20, 'IFCSITE', guid(20), 'Site', '', '');
  entityBuilder.add(40, 'IFCBUILDINGSTOREY', guid(40), 'Storey', '', '');
  entityBuilder.add(50, 'IFCROOF', guid(50), 'Roof', '', '');
  entityBuilder.add(60, 'IFCSLAB', guid(60), 'Roof Slab A', '', '');
  entityBuilder.add(61, 'IFCWALL', guid(61), 'Retyped Child', '', '');

  const relBuilder = new RelationshipGraphBuilder();
  // The site's containment is declared FIRST, so a reader that takes the
  // first raw candidate lands on the site rather than the storey.
  relBuilder.addEdge(20, 50, RelationshipType.ContainsElements, 71);
  relBuilder.addEdge(40, 50, RelationshipType.ContainsElements, 70);
  relBuilder.addEdge(50, 60, RelationshipType.Aggregates, 83);
  relBuilder.addEdge(50, 61, RelationshipType.DefinesByType, 90);

  // Zero-length refs: a server parse indexes every entity by id but has no
  // bytes behind them, which is exactly the state under test.
  const byId = new Map<number, { type: string; byteOffset: number; byteLength: number }>([
    [10, 'IFCPROJECT'], [20, 'IFCSITE'], [40, 'IFCBUILDINGSTOREY'],
    [50, 'IFCROOF'], [60, 'IFCSLAB'], [61, 'IFCWALL'],
    [70, 'IFCRELCONTAINEDINSPATIALSTRUCTURE'], [71, 'IFCRELCONTAINEDINSPATIALSTRUCTURE'],
    [83, 'IFCRELAGGREGATES'],
    [90, 'IFCRELDEFINESBYTYPE'],
  ].map(([id, type]) => [id as number, { type: type as string, byteOffset: 0, byteLength: 0 }]));

  return {
    fileSize: 0, schemaVersion: 'IFC4', entityCount: 6, parseTime: 0,
    source: EMPTY_SOURCE_BYTES,
    entityIndex: { byId, byType: new Map() },
    strings,
    entities: entityBuilder.build(),
    properties: new PropertyTableBuilder(strings).build(),
    quantities: new QuantityTableBuilder(strings).build(),
    relationships: relBuilder.build(),
    spatialHierarchy: {
      project: {
        expressId: 10,
        name: 'Project',
        children: [{ expressId: 20, name: 'Site', children: [{ expressId: 40, name: 'Storey', children: [] }] }],
      },
      bySite: new Map<number, number[]>([[20, [50]]]),
      byBuilding: null,
      byStorey: new Map<number, number[]>([[40, [50]]]),
      bySpace: null,
    },
  } as unknown as IfcDataStore;
}

function classCodes(file: IfcxFileLike): string[] {
  return file.data
    .map((n) => n.attributes?.['bsi::ifc::class'])
    .filter((c): c is { code: string } => typeof c === 'object' && c !== null && 'code' in c)
    .map((c) => c.code);
}

describe('IFC5 export follows decomposition (#4841)', () => {
  it('keeps an aggregated element the spatial structure never contains', async () => {
    const store = await parse(ROOF_MODEL);
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const slabA = nodeNamed(file, 'Roof Slab A');
    const slabB = nodeNamed(file, 'Roof Slab B');
    expect(slabA).toBeDefined();
    expect(slabB).toBeDefined();

    // ...under the roof that aggregates them, not loose at the document root
    // and not under the storey, which contains neither.
    const roof = nodeNamed(file, 'Roof');
    expect(Object.values(roof?.children ?? {})).toEqual(
      expect.arrayContaining([slabA?.path, slabB?.path]),
    );

    const reached = reachablePaths(file);
    expect([reached.has(slabA?.path as string), reached.has(slabB?.path as string)]).toEqual([true, true]);
  });

  it('keeps the geometry of an aggregated element', async () => {
    const store = await parse(ROOF_MODEL);
    // Roof #50 carries no mesh of its own; all of its geometry is on its parts.
    const result = new Ifc5Exporter(store, geometryOf(55, 60, 61)).export({});
    const file: IfcxFileLike = JSON.parse(result.content);

    const withMesh = file.data
      .filter((n) => n.attributes?.['usd::usdgeom::mesh'] !== undefined)
      .map((n) => n.attributes?.['bsi::ifc::prop::Name']);
    expect(withMesh.sort()).toEqual(['Roof Slab A', 'Roof Slab B', 'Wall']);
    expect(result.stats.meshCount).toBe(3);
  });

  it('still filters out what is not part of the model tree', async () => {
    const store = await parse(ROOF_MODEL);
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    // The fix must not degenerate into `onlyTreeEntities: false`: type objects
    // and relationship entities stay out, which is what the filter is for.
    const codes = classCodes(file);
    expect(codes).not.toContain('IfcWallType');
    expect(codes).not.toContain('IfcRelDefinesByType');
    expect(codes).not.toContain('IfcRelAggregates');
    expect(codes).not.toContain('IfcRelContainedInSpatialStructure');
    expect(codes.filter((c) => c === 'IfcSlab')).toHaveLength(2);
  });

  it('follows IfcRelNests the same way', async () => {
    // The parser folds `IfcRelNests` into the same decomposition edge bucket,
    // and a nested part loses its geometry to exactly the same filter.
    const store = await parse(step(`#50=IFCFLOWTERMINAL('${guid(50)}',$,'Terminal',$,$,#3,$,'T1');
#62=IFCDISTRIBUTIONPORT('${guid(62)}',$,'Port',$,$,#3,$,.SOURCE.,$,$);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50),#40);
#84=IFCRELNESTS('${guid(84)}',$,$,$,#50,(#62));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const port = nodeNamed(file, 'Port');
    expect(port).toBeDefined();
    expect(Object.values(nodeNamed(file, 'Terminal')?.children ?? {})).toContain(port?.path);
    expect(reachablePaths(file).has(port?.path as string)).toBe(true);
  });

  it('leaves spatial containment in charge where a file declares both', async () => {
    // An element a file BOTH contains in a storey and aggregates into an
    // assembly keeps the storey it has always been exported under —
    // decomposition only speaks for a child containment leaves unplaced.
    const store = await parse(step(`#50=IFCELEMENTASSEMBLY('${guid(50)}',$,'Assembly',$,$,#3,$,'A1',$,.NOTDEFINED.);
#63=IFCBEAM('${guid(63)}',$,'Beam',$,$,#3,$,'B1',.BEAM.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50,#63),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#50,(#63));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const beam = nodeNamed(file, 'Beam');
    expect(beam).toBeDefined();
    expect(Object.values(nodeNamed(file, 'Storey')?.children ?? {})).toContain(beam?.path);
    expect(Object.values(nodeNamed(file, 'Assembly')?.children ?? {})).not.toContain(beam?.path);
  });

  it('terminates on a cyclic decomposition and keeps the hierarchy acyclic', async () => {
    // Entity references come from the file, so the aggregation graph can be
    // cyclic; the closure is bounded by the set it is filling, so a cycle
    // costs one visit per member rather than spinning. The back-edge must not
    // become a parent edge either — a cyclic parent map would make the
    // re-parenting walk give up and dump the slab at the document root instead
    // of under the roof the storey contains.
    const store = await parse(step(`#50=IFCROOF('${guid(50)}',$,'Roof',$,$,#3,$,'Roof',$);
#60=IFCSLAB('${guid(60)}',$,'Roof Slab A',$,$,#3,$,'SlabA',.ROOF.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#50,(#60));
#85=IFCRELAGGREGATES('${guid(85)}',$,$,$,#60,(#50));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const slab = nodeNamed(file, 'Roof Slab A');
    expect(classCodes(file).filter((c) => c === 'IfcSlab')).toHaveLength(1);
    expect(Object.values(nodeNamed(file, 'Roof')?.children ?? {})).toContain(slab?.path);
    expect(Object.values(nodeNamed(file, 'Storey')?.children ?? {})).toContain(nodeNamed(file, 'Roof')?.path);
    expect(reachablePaths(file).has(slab?.path as string)).toBe(true);
  });

  it('emits a part two parents aggregate exactly once', async () => {
    // A diamond is `IfcRelAggregates` misuse and files still emit it: neither
    // candidate parent is a descendant of the part, so the tie is resolved by
    // declaration order rather than by listing the part under both.
    const store = await parse(step(`#50=IFCELEMENTASSEMBLY('${guid(50)}',$,'Assembly A',$,$,#3,$,'A1',$,.NOTDEFINED.);
#51=IFCELEMENTASSEMBLY('${guid(51)}',$,'Assembly B',$,$,#3,$,'A2',$,.NOTDEFINED.);
#63=IFCBEAM('${guid(63)}',$,'Shared Beam',$,$,#3,$,'B1',.BEAM.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50,#51),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#50,(#63));
#86=IFCRELAGGREGATES('${guid(86)}',$,$,$,#51,(#63));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const beam = nodeNamed(file, 'Shared Beam');
    expect(classCodes(file).filter((c) => c === 'IfcBeam')).toHaveLength(1);
    const listedBy = ['Assembly A', 'Assembly B']
      .filter((n) => Object.values(nodeNamed(file, n)?.children ?? {}).includes(beam?.path as string));
    expect(listedBy).toEqual(['Assembly A']);
    expect(reachablePaths(file).has(beam?.path as string)).toBe(true);
  });

  it('uses an overlay-retargeted RelatedObjects endpoint for filtering and hierarchy', async () => {
    // Review regression: the parsed RelationshipGraph is immutable. Reading it
    // after this edit retained the old slab, dropped the new slab and its mesh,
    // and made the saved tree disagree with the relationship the overlay owns.
    const store = await parse(ROOF_MODEL);
    const view = new MutablePropertyView(null, 'ifc5-decomposition');
    const cyclicRefs: IfcAttributeValue[] = ['#61'];
    cyclicRefs.push(cyclicRefs);
    view.setPositionalAttribute(83, 5, cyclicRefs);
    const result = new Ifc5Exporter(store, geometryOf(60, 61), view).export({});
    const file: IfcxFileLike = JSON.parse(result.content);

    const oldSlab = nodeNamed(file, 'Roof Slab A');
    const newSlab = nodeNamed(file, 'Roof Slab B');
    expect(oldSlab).toBeUndefined();
    expect(newSlab).toBeDefined();
    expect(Object.values(nodeNamed(file, 'Roof')?.children ?? {})).toContain(newSlab?.path);
    expect(reachablePaths(file).has(newSlab?.path as string)).toBe(true);
    expect(result.stats.meshCount).toBe(1);
  });

  it('applies relationship overlays to a sourceless store graph', async () => {
    const parsed = await parse(ROOF_MODEL);
    const store: IfcDataStore = { ...parsed, source: EMPTY_SOURCE_BYTES };
    const retargeted = new MutablePropertyView(null, 'ifc5-sourceless-retarget');
    retargeted.setPositionalAttribute(70, 4, ['#61']);
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, retargeted).export({ includeGeometry: false }).content,
    );

    const slab = nodeNamed(file, 'Roof Slab B');
    expect(nodeNamed(file, 'Roof')).toBeUndefined();
    expect(Object.values(nodeNamed(file, 'Storey')?.children ?? {})).toContain(slab?.path);

    const deleted = new MutablePropertyView(null, 'ifc5-sourceless-delete');
    deleted.deleteEntity(70);
    const withoutContainment: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, deleted).export({ includeGeometry: false }).content,
    );
    expect(nodeNamed(withoutContainment, 'Roof')).toBeUndefined();
    expect(nodeNamed(withoutContainment, 'Wall')).toBeUndefined();
  });

  it('skips a first-declared back-edge when a valid aggregate parent exists', async () => {
    // Review regression: A -> B, followed by the malformed back-edge B -> A,
    // must not beat the later valid Roof -> A edge and orphan the A/B subtree.
    const store = await parse(step(`#50=IFCROOF('${guid(50)}',$,'Roof',$,$,#3,$,'Roof',$);
#60=IFCSLAB('${guid(60)}',$,'Roof Slab A',$,$,#3,$,'SlabA',.ROOF.);
#61=IFCSLAB('${guid(61)}',$,'Roof Slab B',$,$,#3,$,'SlabB',.ROOF.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#60,(#61));
#84=IFCRELAGGREGATES('${guid(84)}',$,$,$,#61,(#60));
#85=IFCRELAGGREGATES('${guid(85)}',$,$,$,#50,(#60));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const roof = nodeNamed(file, 'Roof');
    const slabA = nodeNamed(file, 'Roof Slab A');
    const slabB = nodeNamed(file, 'Roof Slab B');
    expect(Object.values(roof?.children ?? {})).toContain(slabA?.path);
    expect(Object.values(slabA?.children ?? {})).toContain(slabB?.path);
    expect(reachablePaths(file).has(slabB?.path as string)).toBe(true);
  });

  it('uses an overlay-retargeted containment endpoint', async () => {
    const store = await parse(step(`#60=IFCSLAB('${guid(60)}',$,'Old Slab',$,$,#3,$,'Old',.FLOOR.);
#61=IFCSLAB('${guid(61)}',$,'New Slab',$,$,#3,$,'New',.FLOOR.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#60),#40);`));
    const view = new MutablePropertyView(null, 'ifc5-containment');
    view.setPositionalAttribute(70, 4, ['#61']);
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, view).export({ includeGeometry: false }).content,
    );

    expect(nodeNamed(file, 'Old Slab')).toBeUndefined();
    const newSlab = nodeNamed(file, 'New Slab');
    expect(Object.values(nodeNamed(file, 'Storey')?.children ?? {})).toContain(newSlab?.path);
    expect(reachablePaths(file).has(newSlab?.path as string)).toBe(true);

    const deletedView = new MutablePropertyView(null, 'ifc5-containment-deleted');
    deletedView.deleteEntity(70);
    const withoutRelationship: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, deletedView).export({ includeGeometry: false }).content,
    );
    expect(nodeNamed(withoutRelationship, 'Old Slab')).toBeUndefined();
    expect(nodeNamed(withoutRelationship, 'New Slab')).toBeUndefined();
  });

  it('keeps descendants of a tombstoned spatial container reachable', async () => {
    const store = await parse(ROOF_MODEL);
    const view = new MutablePropertyView(null, 'ifc5-deleted-container');
    view.deleteEntity(40);
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, view).export({ includeGeometry: false }).content,
    );

    expect(nodeNamed(file, 'Storey')).toBeUndefined();
    const roof = nodeNamed(file, 'Roof');
    expect(roof).toBeDefined();
    expect(Object.values(nodeNamed(file, 'Building')?.children ?? {})).toContain(roof?.path);
    expect(reachablePaths(file).has(roof?.path as string)).toBe(true);
  });

  it('prefers a reachable aggregate parent over an earlier disconnected one', async () => {
    const store = await parse(step(`#50=IFCROOF('${guid(50)}',$,'Roof',$,$,#3,$,'Roof',$);
#55=IFCELEMENTASSEMBLY('${guid(55)}',$,'Disconnected',$,$,#3,$,'D',$,.NOTDEFINED.);
#60=IFCSLAB('${guid(60)}',$,'Roof Slab',$,$,#3,$,'Slab',.ROOF.);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(70)}',$,$,$,(#50),#40);
#83=IFCRELAGGREGATES('${guid(83)}',$,$,$,#55,(#60));
#84=IFCRELAGGREGATES('${guid(84)}',$,$,$,#50,(#60));`));
    const file: IfcxFileLike = JSON.parse(new Ifc5Exporter(store).export({ includeGeometry: false }).content);

    const slab = nodeNamed(file, 'Roof Slab');
    expect(nodeNamed(file, 'Disconnected')).toBeUndefined();
    expect(Object.values(nodeNamed(file, 'Roof')?.children ?? {})).toContain(slab?.path);
    expect(reachablePaths(file).has(slab?.path as string)).toBe(true);
  });

  it('follows decomposition in a store parsed without source bytes', async () => {
    // Server-parsed, synthetic and IFCX-rebuilt stores carry a populated
    // relationship graph and zero source bytes, and `source` stays a truthy
    // object in that state — so a presence check on it reads as "bytes
    // available", extraction returns nothing for every relationship, and the
    // decomposition silently disappears again on the path the viewer uses for
    // a server parse. The parsed graph has to answer instead.
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(sourcelessRoofStore()).export({ includeGeometry: false }).content,
    );

    const slab = nodeNamed(file, 'Roof Slab A');
    expect(slab).toBeDefined();
    expect(Object.values(nodeNamed(file, 'Roof')?.children ?? {})).toContain(slab?.path);
    expect(reachablePaths(file).has(slab?.path as string)).toBe(true);
  });

  it('keeps the parser-resolved container when a source-less store repeats it up the tree', async () => {
    // A parse that attributes an element to every level above it leaves the
    // raw graph naming both the storey and the site as containers, while
    // `spatialHierarchy` names the one the parser resolved. Reading the raw
    // candidates over that resolution moved the roof from its storey up to
    // the site, which an IFCX round trip through this exporter loses outright
    // (`ifcx-roundtrip.test.ts` > preserves hierarchy relations).
    const store = sourcelessRoofStore();
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store).export({ includeGeometry: false }).content,
    );

    const roof = nodeNamed(file, 'Roof');
    expect(Object.values(nodeNamed(file, 'Storey')?.children ?? {})).toContain(roof?.path);
    expect(Object.values(nodeNamed(file, 'Site')?.children ?? {})).not.toContain(roof?.path);
  });

  it('follows a source-less relationship retyped into decomposition', () => {
    const store = sourcelessRoofStore();
    const view = new MutablePropertyView(null, 'ifc5-sourceless-retype');
    view.setEntityType(90, 'IfcRelAggregates', null, 'IfcRelDefinesByType');
    view.setPositionalAttribute(90, 4, '#50');
    view.setPositionalAttribute(90, 5, ['#61']);
    const file: IfcxFileLike = JSON.parse(
      new Ifc5Exporter(store, null, view).export({ includeGeometry: false }).content,
    );
    const child = nodeNamed(file, 'Retyped Child');
    expect(Object.values(nodeNamed(file, 'Roof')?.children ?? {})).toContain(child?.path);
    expect(reachablePaths(file).has(child?.path as string)).toBe(true);
  });
});
