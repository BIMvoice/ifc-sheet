/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The structural grid as a view's overlay, against a real mesh pipeline.
 * `__fixtures__/structural-grid.ifc` (millimetres, committed next to this test
 * and outside `public/`, so it never ships) has a four-column
 * building on a 2 x 2 grid (A, B at 6 m; 1, 2 at 5 m) whose IfcGrid is placed
 * under the IfcBuilding at (10 m, 20 m) in a storey that is itself offset (5 m, -2 m) and
 * raised 3 m, rotated 15 degrees, while the columns sit under the same storey. Every axis must pass through
 * the centres of the two columns it names, to the millimetre: a frame error in
 * the grid's placement chain, its rotation or the unit scale moves them apart.
 */

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { GeometryProcessor, type MeshData } from '@ifc-lite/geometry';
import { addGridToStore, extractGridAxesForStorey, rectangularGridAxes, resolveSpatialAnchor } from '@ifc-lite/create';
import { MutablePropertyView, StoreEditor } from '@ifc-lite/mutations';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftShape, Pt } from '@/drafting/types';
import { buildStoreyWorkplane } from '@/lib/commands/modeling/workplane';
import { gridAxesInRender, gridOverlays, setGridExtractorForTests } from './grid-overlay.js';
import { planOverlays, type PlanOverlay } from './plan-overlays.js';
import type { PlanProjectView, ProjectView, SectionProjectView, GridEnds } from './types.js';

const WASM = new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
const FIXTURE = new URL('./__fixtures__/structural-grid.ifc', import.meta.url);
const FZK = new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url);
/** Every test here runs the real mesh pipeline: without the wasm runtime it skips, never throws. */
const wasmOptions = { skip: !existsSync(WASM) && 'Run pnpm build:wasm' };

const PLAN_PLANE: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const base = { id: 'v', name: 'v', createdAt: 0 };
const plan = (grid?: { visible?: boolean; ends?: GridEnds }): PlanProjectView => ({
  ...base, kind: 'plan', level: { name: 'Level 0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, ...(grid ? { graphics: { grid } } : {}),
});
const section = (grid?: { visible?: boolean; ends?: GridEnds }): SectionProjectView => ({
  ...base, kind: 'section', plane: { axis: 'side', offset: 0, flipped: false }, ...(grid ? { graphics: { grid } } : {}),
});
const BOUNDS_Z = { bounds: { min: { x: 10, y: -0.5 }, max: { x: 30, y: 3.5 } } } as unknown as Drawing2D;
const BOUNDS = { bounds: { min: { x: -32, y: 2.5 }, max: { x: -12, y: 6.5 } } } as unknown as Drawing2D;

let wasmReady = false;
async function loadModel(bytes: Uint8Array): Promise<{ store: IfcDataStore; meshes: MeshData[]; coordinateInfo: unknown }> {
  if (!wasmReady) {
    const { default: init } = await import('@ifc-lite/wasm');
    await init({ module_or_path: await readFile(WASM) });
    wasmReady = true;
  }
  const processor = new GeometryProcessor();
  let result;
  try {
    await processor.init();
    result = await processor.process(bytes.slice());
  } finally { processor.dispose(); }
  const store = await new IfcParser().parseColumnar(bytes.slice().buffer, { disableWorkerScan: true });
  return { store, meshes: result.meshes, coordinateInfo: result.coordinateInfo };
}

/** Seed the viewer store with one model, the way a loaded file sits in it. */
async function seed(bytes: Uint8Array): Promise<{ store: IfcDataStore; meshes: MeshData[] }> {
  const { store, meshes, coordinateInfo } = await loadModel(bytes);
  useViewerStore.setState({
    models: new Map([['m', { id: 'm', ifcDataStore: store, geometryResult: { meshes, coordinateInfo }, visible: true }]]) as never,
    mutationViews: new Map(),
  });
  return { store, meshes };
}

/** A column's centre in the plan's drawing coordinates, from its rendered mesh. */
function columnCentres(store: IfcDataStore, meshes: readonly MeshData[]): Map<string, Pt> {
  const boxes = new Map<number, { min: number[]; max: number[] }>();
  for (const mesh of meshes) {
    const o = mesh.origin ?? [0, 0, 0];
    const box = boxes.get(mesh.expressId) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        box.min[a] = Math.min(box.min[a], mesh.positions[i + a] + o[a]);
        box.max[a] = Math.max(box.max[a], mesh.positions[i + a] + o[a]);
      }
    }
    boxes.set(mesh.expressId, box);
  }
  const out = new Map<string, Pt>();
  for (const [id, box] of boxes) {
    const name = store.entities.getName(id) ?? '';
    if (!name.startsWith('Column ')) continue;
    out.set(name.slice(7), worldToDrawing(PLAN_PLANE, { x: (box.min[0] + box.max[0]) / 2, y: 0, z: (box.min[2] + box.max[2]) / 2 }));
  }
  return out;
}

const COLUMNS_OF: Record<string, [string, string]> = { A: ['A1', 'A2'], B: ['B1', 'B2'], 1: ['A1', 'B1'], 2: ['A2', 'B2'] };

/** Distance from `p` to the infinite line through a and b. */
function lineDistance(p: Pt, a: Pt, b: Pt): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

const linesOf = (overlays: PlanOverlay[]) => overlays.filter((o) => o.lineType === 'dashdot').flatMap((o) => o.shapes).filter((s): s is Extract<DraftShape, { type: 'line' }> => s.type === 'line');
const bubblesOf = (overlays: PlanOverlay[]) => overlays.filter((o) => o.lineType !== 'dashdot').flatMap((o) => o.shapes).filter((s): s is Extract<DraftShape, { type: 'circle' }> => s.type === 'circle');
const textsOf = (overlays: PlanOverlay[]) => overlays.flatMap((o) => o.texts ?? []);

/**
 * The worst distance of an axis from a column it names, in metres, for the
 * fixture text `ifc`. Throws unless all four axes are drawn.
 */
async function frameError(ifc: string): Promise<number> {
  const { store, meshes } = await seed(new TextEncoder().encode(ifc));
  const centres = columnCentres(store, meshes);
  const overlays = gridOverlays(plan(), PLAN_PLANE);
  const lines = linesOf(overlays);
  assert.equal(lines.length, 4, 'all four axes are drawn');
  // Axes come in file order: A, B, 1, 2; with bubbles at both ends their tags come in pairs.
  const tags = textsOf(overlays).map((t) => t.text).filter((_, i) => i % 2 === 0);
  let worst = 0;
  lines.forEach((line, i) => {
    for (const column of COLUMNS_OF[tags[i]]) worst = Math.max(worst, lineDistance(centres.get(column)!, line.a, line.b));
  });
  return worst;
}

/** The grid's own placement: IFCGRID -> IfcLocalPlacement -> IfcAxis2Placement3D -> (point, ref direction). */
function gridPlacement(ifc: string) {
  const placement = /#\d+= IFCGRID\([^,]*,[^,]*,[^,]*,[^,]*,[^,]*,#(\d+),/.exec(ifc)![1];
  const axis = new RegExp(`#${placement}= IFCLOCALPLACEMENT\\(#\\d+,#(\\d+)\\)`).exec(ifc)![1];
  const [, point, , direction] = new RegExp(`#${axis}= IFCAXIS2PLACEMENT3D\\(#(\\d+),#(\\d+),#(\\d+)\\)`).exec(ifc)!;
  return { placement, point, direction };
}

describe('structural grid on a plan', () => {
  let fixture = '';
  before(async () => { fixture = await readFile(FIXTURE, 'utf8'); });

  it('puts every axis through the centres of its two columns, to the millimetre', wasmOptions, async () => {
    assert.ok(await frameError(fixture) < 0.001);
  });

  it('mutation: a grid placed without its rotation is off by metres', wasmOptions, async () => {
    const { direction } = gridPlacement(fixture);
    const broken = fixture.replace(new RegExp(`#${direction}= IFCDIRECTION\\([^)]*\\)\\)`), `#${direction}= IFCDIRECTION((1.,0.,0.))`);
    assert.notEqual(broken, fixture);
    assert.ok(await frameError(broken) > 0.5);
  });

  it('mutation: a grid placed without its translation is off by tens of metres', wasmOptions, async () => {
    const { point } = gridPlacement(fixture);
    const broken = fixture.replace(new RegExp(`#${point}= IFCCARTESIANPOINT\\([^;]*;`), `#${point}= IFCCARTESIANPOINT((0.,0.,0.));`);
    assert.notEqual(broken, fixture);
    assert.ok(await frameError(broken) > 10);
  });

  it('mutation: a storey placement dropped from the chain leaves the axes at the wrong place', wasmOptions, async () => {
    const storeyPlacement = /#\d+= IFCBUILDINGSTOREY\([^,]*,[^,]*,[^,]*,[^,]*,[^,]*,#(\d+),/.exec(fixture)![1];
    const broken = fixture.replace(new RegExp(`(#\\d+= IFCBUILDINGSTOREY\\([^,]*,[^,]*,[^,]*,[^,]*,[^,]*,)#${storeyPlacement},`), '$1$,');
    assert.notEqual(broken, fixture);
    const error = await frameError(broken).catch(() => Infinity);
    assert.ok(error > 1, `off by ${error} m`);
  });

  it('mutation: a grid without an ObjectPlacement in a placed storey is not drawn at a guessed place', wasmOptions, async () => {
    const { placement } = gridPlacement(fixture);
    const broken = fixture.replace(new RegExp(`(#\\d+= IFCGRID\\([^,]*,[^,]*,[^,]*,[^,]*,[^,]*,)#${placement},`), '$1$,');
    assert.notEqual(broken, fixture);
    await assert.rejects(frameError(broken), /all four axes/);
  });

  it('puts the tags A, B, 1, 2 on bubbles at the configured ends', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    const tagsAt = (ends: GridEnds | undefined) => {
      const overlays = gridOverlays(plan(ends ? { ends } : undefined), PLAN_PLANE);
      const lines = linesOf(overlays), bubbles = bubblesOf(overlays), texts = textsOf(overlays);
      return { lines, bubbles, tags: texts.map((t) => t.text).sort() };
    };
    const both = tagsAt(undefined);
    assert.deepEqual(both.tags, ['1', '1', '2', '2', 'A', 'A', 'B', 'B'], 'both ends is the default');
    assert.equal(both.bubbles.length, 8);
    const start = tagsAt('start'), end = tagsAt('end');
    assert.deepEqual(start.tags, ['1', '2', 'A', 'B']);
    assert.deepEqual(end.tags, ['1', '2', 'A', 'B']);
    // `start` bubbles hang off each line's first end, `end` bubbles off its second.
    start.lines.forEach((line, i) => {
      const c = start.bubbles[i].c;
      assert.ok(Math.hypot(c.x - line.a.x, c.y - line.a.y) < Math.hypot(c.x - line.b.x, c.y - line.b.y));
    });
    end.lines.forEach((line, i) => {
      const c = end.bubbles[i].c;
      assert.ok(Math.hypot(c.x - line.b.x, c.y - line.b.y) < Math.hypot(c.x - line.a.x, c.y - line.a.y));
    });
    // The bubble sits at the end of the line, a radius off it; the line runs past the authored axis.
    const c = both.bubbles[0].c, line = both.lines[0];
    assert.ok(Math.abs(Math.hypot(c.x - line.a.x, c.y - line.a.y) - both.bubbles[0].r) < 1e-9);
  });

  it('puts the start bubble at the authored start: an axis with SameSense .F. swaps its bubbles (PR #125 review)', wasmOptions, async () => {
    const bubbleOfA = async (ifc: string, ends: GridEnds) => {
      await seed(new TextEncoder().encode(ifc));
      const overlays = gridOverlays(plan({ ends }), PLAN_PLANE);
      // Axes in file order, one bubble each: axis A is the first.
      assert.equal(textsOf(overlays)[0].text, 'A');
      return bubblesOf(overlays)[0].c;
    };
    const reversed = fixture.replace(/(IFCGRIDAXIS\('A',#\d+,)\.T\.\)/, '$1.F.)');
    assert.notEqual(reversed, fixture);
    const authoredEnd = await bubbleOfA(fixture, 'end');
    const reversedStart = await bubbleOfA(reversed, 'start');
    assert.ok(Math.hypot(reversedStart.x - authoredEnd.x, reversedStart.y - authoredEnd.y) < 1e-6, 'the start bubble moved to the other end');
    assert.ok(Math.hypot(reversedStart.x - (await bubbleOfA(fixture, 'start')).x, reversedStart.y - (await bubbleOfA(fixture, 'start')).y) > 1, 'and is not where it was');
  });

  it('runs each axis across the drawing and no further than its bubble fits in the auto-fit margin', wasmOptions, async () => {
    const { meshes } = await seed(new TextEncoder().encode(fixture));
    // The building's box in the plan's drawing coordinates (x = render x, y = render z), from its meshes.
    const box = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) {
      const o = m.origin ?? [0, 0, 0], x = m.positions[i] + o[0], z = m.positions[i + 2] + o[2];
      box.min.x = Math.min(box.min.x, x); box.max.x = Math.max(box.max.x, x);
      box.min.y = Math.min(box.min.y, z); box.max.y = Math.max(box.max.y, z);
    }
    const overlays = gridOverlays(plan(), PLAN_PLANE, { bounds: box } as unknown as Drawing2D);
    const unit = 0.1; // 1:100, metres per paper millimetre
    const lines = linesOf(overlays);
    assert.equal(lines.length, 4);
    const slack = (p: Pt) => Math.max(box.min.x - p.x, p.x - box.max.x, box.min.y - p.y, p.y - box.max.y);
    for (const l of lines) for (const p of [l.a, l.b]) assert.ok(slack(p) >= -1e-9 && slack(p) <= 0.2 + 1e-9, `end ${slack(p)} m outside the box: at most the 2 mm stub`);
    for (const b of bubblesOf(overlays)) assert.ok(slack(b.c) + b.r <= 10 * unit + 1e-6, 'a bubble stays inside the 10 mm margin');
  });

  it('draws a dash-dot GRID line and continuous GRID bubbles, and nothing when the view switches the grid off', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    const overlays = gridOverlays(plan(), PLAN_PLANE);
    assert.deepEqual(overlays.map((o) => [o.layer, o.lineType ?? 'continuous']), [['GRID', 'dashdot'], ['GRID', 'continuous']]);
    // Bubbles print the same size on paper whatever scale the viewport shows the view at: 4 mm is 0.4 m at 1:100, 0.2 m at 1:50.
    assert.ok(Math.abs(bubblesOf(overlays)[0].r - 0.4) < 1e-9);
    assert.ok(Math.abs(bubblesOf(gridOverlays(plan(), PLAN_PLANE, null, 50))[0].r - 0.2) < 1e-9);
    assert.deepEqual(gridOverlays(plan({ visible: false }), PLAN_PLANE), []);
    assert.deepEqual(gridOverlays({ ...plan(), kind: '3d', viewpoint: null } as unknown as ProjectView, PLAN_PLANE), []);
  });

  it('names each axis by its grid\'s GlobalId and its tag, so an edit or a re-export finds it again', wasmOptions, async () => {
    const { store } = await seed(new TextEncoder().encode(fixture));
    const storeyId = [...store.spatialHierarchy!.storeyElevations.keys()][0];
    const workplane = buildStoreyWorkplane(useViewerStore.getState(), 'm', storeyId, 0);
    assert.ok(!('refused' in workplane));
    const guid = /IFCGRID\('([^']+)'/.exec(fixture)![1];
    const axes = gridAxesInRender(store, null, storeyId, workplane as never);
    assert.deepEqual(axes.map((a) => a.axis.key), ['A', 'B', '1', '2'].map((tag) => `${guid}:${tag}`));
  });

  it('follows the model: the axis moves with an edit of the grid, and keeps its tag', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    const before = linesOf(gridOverlays(plan(), PLAN_PLANE))[0];
    const shifted = fixture.replace(new RegExp(`#${gridPlacement(fixture).point}= IFCCARTESIANPOINT\\([^;]*;`), `#${gridPlacement(fixture).point}= IFCCARTESIANPOINT((10500.,20000.,0.));`);
    assert.notEqual(shifted, fixture);
    await seed(new TextEncoder().encode(shifted));
    const after = linesOf(gridOverlays(plan(), PLAN_PLANE))[0];
    assert.ok(Math.abs(Math.hypot(after.a.x - before.a.x, after.a.y - before.a.y) - 0.5) < 1e-6, 'moved by exactly 0.5 m');
  });
});

describe('structural grid on a section', () => {
  let fixture = '';
  before(async () => { fixture = await readFile(FIXTURE, 'utf8'); });

  // The fixture's axes in IFC metres, from the file's own numbers: grid frame = storey (5, -2) + (10, 20) + R(15 deg).
  const c = Math.cos(Math.PI / 12), s = Math.sin(Math.PI / 12);
  const world = (x: number, y: number): [number, number] => [15 + c * x - s * y, 18 + s * x + c * y];
  const AXES: Record<string, [[number, number], [number, number]]> = {
    A: [world(0, -2), world(0, 7)], B: [world(6, -2), world(6, 7)], 1: [world(-2, 0), world(8, 0)], 2: [world(-2, 5), world(8, 5)],
  };
  /** Where each axis crosses the vertical plane x = `x` (IFC), as the IFC y of the crossing. */
  const FILE_ORDER = ['A', 'B', '1', '2'];
  const crossingsAtX = (x: number) => FILE_ORDER.map((tag) => [tag, AXES[tag]] as const).flatMap(([tag, [a, b]]) => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return t >= 0 && t <= 1 ? [[tag, a[1] + t * (b[1] - a[1])] as const] : [];
  });
  const crossingsAtY = (y: number) => FILE_ORDER.map((tag) => [tag, AXES[tag]] as const).flatMap(([tag, [a, b]]) => {
    const t = (y - a[1]) / (b[1] - a[1]);
    return t >= 0 && t <= 1 ? [[tag, a[0] + t * (b[0] - a[0])] as const] : [];
  });

  it('shows the axes a cut across x crosses, at their positions along the section', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    // Render frame: x = IFC x, z = -IFC y. A side cut at x = 17 m looks along x; drawing x = render z.
    const plane: SectionPlaneConfig = { axis: 'x', position: 17, flipped: false };
    const expected = crossingsAtX(17);
    assert.deepEqual(expected.map(([tag]) => tag).sort(), ['1', '2'], 'the cut crosses the two axes that run along x');
    const overlays = gridOverlays(section(), plane, BOUNDS);
    const lines = linesOf(overlays);
    assert.equal(lines.length, expected.length);
    for (const [i, [, y]] of expected.entries()) {
      assert.ok(Math.abs(lines[i].a.x - -y) < 0.001, `axis ${expected[i][0]} at ${-y}, drawn at ${lines[i].a.x}`);
      assert.equal(lines[i].a.x, lines[i].b.x, 'vertical');
      assert.ok(lines[i].a.y < BOUNDS.bounds.min.y && lines[i].b.y > BOUNDS.bounds.max.y, 'runs past the drawing, foot to head');
    }
    // Bubbles above and below, both by default; only the head with `end`.
    const texts = textsOf(overlays);
    assert.deepEqual(texts.map((t) => t.text).sort(), ['1', '1', '2', '2']);
    assert.ok(texts.some((t) => t.at.y > BOUNDS.bounds.max.y) && texts.some((t) => t.at.y < BOUNDS.bounds.min.y));
    const head = textsOf(gridOverlays(section({ ends: 'end' }), plane, BOUNDS));
    assert.equal(head.length, 2);
    assert.ok(head.every((t) => t.at.y > BOUNDS.bounds.max.y));
  });

  it('shows the axes of a cut across z, and none for a cut beside the building', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    // A front cut at render z = -22 is IFC y = 23; drawing x = render x = IFC x.
    const plane: SectionPlaneConfig = { axis: 'z', position: -23, flipped: false };
    const expected = crossingsAtY(23);
    assert.deepEqual(expected.map(([tag]) => tag).sort(), ['2', 'A', 'B'], 'the cut crosses both axes along y, and the near end of axis 2');
    const lines = linesOf(gridOverlays(section(), plane, BOUNDS_Z));
    assert.equal(lines.length, 3);
    expected.forEach(([tag, x], i) => assert.ok(Math.abs(lines[i].a.x - x) < 0.001, `axis ${tag} at ${x}, drawn at ${lines[i].a.x}`));
    assert.deepEqual(gridOverlays(section(), { axis: 'x', position: 200, flipped: false }, BOUNDS), []);
  });

  it('works through a custom plane the same way', wasmOptions, async () => {
    await seed(new TextEncoder().encode(fixture));
    const plane: SectionPlaneConfig = {
      axis: 'x', position: 17, flipped: false,
      customPlane: { normal: { x: 1, y: 0, z: 0 }, distance: 17, origin: { x: 17, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: 1 }, bitangent: { x: 0, y: 1, z: 0 } },
    } as SectionPlaneConfig;
    const cardinal = linesOf(gridOverlays(section(), { axis: 'x', position: 17, flipped: false }, BOUNDS));
    const custom = linesOf(gridOverlays(section(), plane, BOUNDS));
    assert.equal(cardinal.length, 2);
    assert.deepEqual(custom.map((l) => l.a.x), cardinal.map((l) => l.a.x));
  });
});

describe('a model without a grid', () => {
  it('draws exactly as before: no GRID overlay on the FZK-Haus plan or section', wasmOptions, async () => {
    const { meshes } = await seed(new Uint8Array(await readFile(FZK)));
    const hidden = new Set<string>();
    const sectionPlane: SectionPlaneConfig = { axis: 'z', position: 0, flipped: false };
    assert.deepEqual(gridOverlays(plan(), PLAN_PLANE), []);
    assert.deepEqual(gridOverlays(section(), sectionPlane, BOUNDS), []);
    const p = planOverlays(plan(), PLAN_PLANE, meshes, undefined, hidden);
    assert.ok(p.every((o) => o.layer !== 'GRID'));
    const sec = planOverlays(section(), sectionPlane, meshes, undefined, hidden, BOUNDS);
    assert.ok(sec.every((o) => o.layer !== 'GRID'));
    // Shape counts as origin/main produces them for this model (measured on main): the symbols alone, nothing added.
    assert.deepEqual(p.map((o) => [o.layer, o.shapes.length]), [['SYMBOLS', 33], ['SYMBOLS', 6]]);
    assert.deepEqual(sec, []);
  });
});

describe('grid extraction cost (PR #125 review)', () => {
  /** Count extractor calls; the real extractor does the work. */
  let calls = 0;
  const counting = () => {
    calls = 0;
    setGridExtractorForTests((...args) => { calls++; return extractGridAxesForStorey(...args); });
  };
  afterEach(() => setGridExtractorForTests(null));

  it('never runs the extractor for a model without an IfcGrid', wasmOptions, async () => {
    const { store } = await seed(new Uint8Array(await readFile(FZK)));
    assert.ok(store.spatialHierarchy!.storeyElevations.size > 1, 'FZK-Haus has storeys a walk would visit');
    counting();
    assert.deepEqual(gridOverlays(plan(), PLAN_PLANE), []);
    assert.deepEqual(gridOverlays(section(), { axis: 'z', position: 0, flipped: false }, BOUNDS), []);
    assert.equal(calls, 0);
  });

  it('still draws a grid authored this session in a model whose file has none', wasmOptions, async () => {
    const { store } = await seed(new Uint8Array(await readFile(FZK)));
    assert.equal(store.entityIndex.byType.get('IFCGRID')?.length ?? 0, 0);
    const storeyId = [...store.spatialHierarchy!.storeyElevations.entries()].sort((a, b) => a[1] - b[1])[0][0];
    const view = new MutablePropertyView(null, 'm');
    addGridToStore(new StoreEditor(store, view), resolveSpatialAnchor(store, storeyId, view), {
      Position: [0, 0, 0], ...rectangularGridAxes({ UOffsets: [0, 6], VOffsets: [0, 4], Overhang: 1 }),
    });
    useViewerStore.setState({ mutationViews: new Map([['m', view]]) as never });
    assert.deepEqual(textsOf(gridOverlays(plan(), PLAN_PLANE)).map((t) => t.text).sort(), ['1', '1', '2', '2', 'A', 'A', 'B', 'B']);
  });

  it('extracts once per edit: the same mutationVersion reuses the axes, a new one extracts again', wasmOptions, async () => {
    await seed(new TextEncoder().encode(await readFile(FIXTURE, 'utf8')));
    useViewerStore.setState({ mutationVersion: 7 });
    counting();
    const first = linesOf(gridOverlays(plan(), PLAN_PLANE));
    const once = calls;
    assert.ok(once > 0, 'the first recompute extracts');
    assert.deepEqual(linesOf(gridOverlays(plan(), PLAN_PLANE)), first, 'the reused axes draw the same lines');
    gridOverlays(section(), { axis: 'x', position: 17, flipped: false }, BOUNDS);
    assert.equal(calls, once, 'recomputes at the same mutationVersion extract nothing');
    useViewerStore.setState({ mutationVersion: 8 });
    gridOverlays(plan(), PLAN_PLANE);
    assert.equal(calls, 2 * once, 'an edit extracts again');
  });
});
