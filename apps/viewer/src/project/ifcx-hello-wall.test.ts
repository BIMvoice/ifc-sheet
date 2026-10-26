/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSectionConfig, Drawing2DGenerator, type Drawing2D } from '@ifc-lite/drawing-2d';
import { GeometryProcessor, type GeometryResult } from '@ifc-lite/geometry';
import { MutablePropertyView } from '@ifc-lite/mutations';
import { extractLengthUnitScale, IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { IfcTypeEnum } from '@ifc-lite/data';
import { readRooms } from '@bimvoice/ifcsheet/headless';
import { parseIfcxViewerModel } from '@/hooks/ingest/viewerModelIngest';
import { useViewerStore } from '@/store';
import { modelLevels } from './model-levels';
import { materialNamesInModels } from './materials';
import { drawingMaterialNames } from './material-resolver';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { levelsFromStoreys } from './view-defaults';
import { collectRoomRecords } from '@/urban/urban-models';
import { getIfcLengthUnitScale } from '@/lib/geo/effective-georef';

/**
 * hello-wall.ifcx next to hello-wall.ifc, through the app's own readers (#184). The two files are the same
 * building; the IFC is what every reader is built on, so each assertion is "the IFCX answers as the IFC does":
 * the length unit is known and nothing warns about guessing it, the space is a room on level 0 with its name
 * and area, the three materials are the model's materials and the wall is drawn by its own, and every element
 * is on the storey (the window TYPE is a type, not a fourth element with none).
 */

const SAMPLES = fileURLToPath(new URL('../../public/samples/', import.meta.url));
const WASM = new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
const SKIP = existsSync(WASM) ? false : 'wasm bundle not built: run `pnpm build:wasm:fetch` first';

interface Loaded { ds: IfcDataStore; geometry: GeometryResult; drawing: Drawing2D; model: unknown; view: MutablePropertyView }

const bytesOf = (name: string): ArrayBuffer => {
  const b = readFileSync(`${SAMPLES}${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function serveWasmFromDisk(): void {
  const upstream = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
    if (href.startsWith('file:')) return new Response(await readFile(fileURLToPath(href)), { headers: { 'content-type': 'application/wasm' } });
    return upstream(input, init);
  };
  Reflect.deleteProperty(WebAssembly, 'instantiateStreaming');
}

/** The console warnings `run` makes. */
async function warningsOf(run: () => Promise<void> | void): Promise<string[]> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  try { await run(); } finally { console.warn = original; }
  return warnings;
}

/** Make one loaded model the viewer's only model, with its mutation view. */
function show(c: Pick<Loaded, 'model' | 'view'>): void {
  useViewerStore.setState({ models: new Map([['m', c.model]]), mutationViews: new Map([['m', c.view]]) } as never);
}

/** A model installed as the viewer holds it (with its mutation view), and its plan cut 1.2 m above the floor. */
async function install(name: string): Promise<Loaded> {
  const buffer = bytesOf(name);
  let ds: IfcDataStore;
  let geometry: GeometryResult;
  if (name.endsWith('.ifcx')) {
    const parsed = await parseIfcxViewerModel(buffer);
    ({ dataStore: ds, geometryResult: geometry } = parsed);
  } else {
    ds = await new IfcParser().parseColumnar(buffer);
    serveWasmFromDisk();
    const processor = new GeometryProcessor();
    await processor.init();
    geometry = await processor.process(new Uint8Array(buffer));
  }
  const maxExpressId = Math.max(...geometry.meshes.map((m) => m.expressId));
  const model = { id: 'm', name: 'm', ifcDataStore: ds, geometryResult: geometry, visible: true, idOffset: 0, maxExpressId };
  const view = new MutablePropertyView(ds.properties ?? null, 'm');
  show({ model, view });
  serveWasmFromDisk();
  const generator = new Drawing2DGenerator();
  await generator.initialize();
  const bounds = geometry.coordinateInfo.shiftedBounds;
  const config = createSectionConfig('y', bounds.min.y + 1.2, { projectionDepth: 3, clipProjectionBands: true, projectionBelowDepth: 3, projectionAboveDepth: 3, includeHiddenLines: true, scale: 100 });
  const drawing = await generator.generate(geometry.meshes, config, { includeHiddenLines: true, includeProjection: true, includeEdges: true, mergeLines: true });
  return { ds, geometry, drawing, model, view };
}

describe('hello-wall.ifcx answers as hello-wall.ifc does (#184)', { skip: SKIP }, () => {
  let ifc: Loaded;
  let ifcx: Loaded;
  let loadWarnings: string[];
  let ifcxIds: { storey: number; space: number; elements: number[] };

  before(async () => {
    resetProject();
    ifc = await install('hello-wall.ifc');
    // The IFCX is installed and read under the console spy, as a user opening it would see the console.
    loadWarnings = await warningsOf(async () => {
      ifcx = await install('hello-wall.ifcx');
      useProjectStore.setState({ levels: levelsFromStoreys(modelLevels('m')) });
      syncProjectWithModels([{ id: 'm', name: 'm' } as never], modelLevels('m'));
      collectRoomRecords(useProjectStore.getState().levels);
      getIfcLengthUnitScale(ifcx.ds);
    });
    const t = ifcx.ds.entities;
    const ids = [...t.expressId];
    ifcxIds = {
      storey: ids.find((i) => t.getTypeName(i) === 'IfcBuildingStorey')!,
      space: ids.find((i) => t.getTypeName(i) === 'IfcSpace')!,
      elements: ids.filter((i) => ['IfcWall', 'IfcWindow'].includes(t.getTypeName(i))),
    };
  });
  after(() => { resetProject(); useViewerStore.setState({ models: new Map(), mutationViews: new Map() } as never); });

  it('opens with no warning about a missing IFCPROJECT, an assumed unit, or the spatial anchor', () => {
    assert.deepEqual(loadWarnings, []);
  });

  it('reads the unit rather than assuming it: metres, from the store and from the source, as the IFC reads it', () => {
    assert.equal(ifcx.ds.lengthUnitScale, 1);
    assert.equal(ifc.ds.lengthUnitScale, 1);
    assert.equal(getIfcLengthUnitScale(ifcx.ds), getIfcLengthUnitScale(ifc.ds));
    // The callers that derive it from the bytes and the index (about twenty) get the same, and without a warning.
    return warningsOf(() => { assert.equal(extractLengthUnitScale(ifcx.ds.source, ifcx.ds.entityIndex), 1); }).then((w) => assert.deepEqual(w, []));
  });

  it('has one room, on level 0, named and measured: as the IFC has', () => {
    show(ifcx);
    const levels = levelsFromStoreys(modelLevels('m'));
    const { rooms } = collectRoomRecords(levels);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].level, 0);
    assert.equal(rooms[0].name, 'My_Space');
    assert.ok((rooms[0].area ?? 0) > 0 && rooms[0].source === 'geometry', JSON.stringify(rooms[0]));
    // The engine's own reader (the command line's) reads the same room from the spatial tree.
    const headless = readRooms(ifcx.ds, ifcx.geometry.meshes).rooms;
    assert.deepEqual(headless.map((r) => [r.name, r.level]), [['My_Space', 0]]);
    assert.equal(ifcx.drawing.cutPolygons.filter((p) => p.ifcType === 'IfcSpace').length, ifc.drawing.cutPolygons.filter((p) => p.ifcType === 'IfcSpace').length);
  });

  it('has the same three materials as the IFC, and draws the wall by its own', () => {
    const modelWith = show;
    modelWith(ifc);
    const ifcNames = materialNamesInModels();
    modelWith(ifcx);
    assert.deepEqual(materialNamesInModels(), ifcNames);
    assert.deepEqual(ifcNames, ['CONCRETE', 'GLASS', 'WOOD']);
    useProjectStore.setState({ materials: [{ id: 'c', name: 'CONCRETE', hatch: 'CONCRETE' }] as never });
    try {
      assert.deepEqual(drawingMaterialNames(ifcx.drawing), ['CONCRETE']);
      modelWith(ifc);
      assert.deepEqual(drawingMaterialNames(ifc.drawing), ['CONCRETE']);
    } finally {
      useProjectStore.setState({ materials: [] });
      modelWith(ifcx);
    }
  });

  it('sits all 4 elements on the storey: the wall, the two windows and the space; the window type is a type', () => {
    const h = ifcx.ds.spatialHierarchy!;
    assert.equal(ifcxIds.elements.length, 3);
    for (const id of [...ifcxIds.elements, ifcxIds.space]) assert.equal(h.elementToStorey.get(id), ifcxIds.storey, `${ifcx.ds.entities.getName(id)} is on the storey`);
    const t = ifcx.ds.entities;
    const types = [...t.expressId].filter((i) => t.getTypeEnum(i) === IfcTypeEnum.IfcWindowType);
    assert.deepEqual(types.map((i) => t.getName(i)), ['WT01']);
    assert.equal(h.elementToStorey.has(types[0]), false);
    // No IfcWindow without a storey, which is what "1 of 4 elements on no storey" was.
    assert.deepEqual([...t.expressId].filter((i) => t.getTypeName(i) === 'IfcWindow' && !h.elementToStorey.has(i)), []);
  });
});
