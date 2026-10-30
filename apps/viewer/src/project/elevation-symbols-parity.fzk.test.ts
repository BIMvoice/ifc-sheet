/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless engine draws the door and window symbols of elevations and sections as the app does (#587). AC20-FZK-Haus is loaded into
 * the app's stores and its own geometry (`viewElevationSymbols` over the loaded meshes, the project store's types, flips, opening-line
 * convention and the stated swings) and opened by the engine (`viewOpeningSymbols` over `openModel`'s meshes and the project's facts).
 * The rows are the four elevations and two sections that a cardinal plane cuts through windows (the sections the default set proposes
 * are on a custom plane, which draws no symbols in either); both sides read the one drawing the engine made, so the elevation's visible
 * elements are the same. Each symbol kind has a case that first asserts its rows hold strokes of that kind (a comparison with none is
 * no comparison): the stated door's opening lines, a configured window's opening lines, glazing bars, an arched head, the transom row.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, viewOpeningSymbols as engineSymbols, visibleEntities, type OpeningSymbol } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewElevationSymbols } from './view-symbols';
import type { ProjectView } from './types';
import { configureElementType } from '@/joinery/type-config-actions';
import { elementFacts } from '@/joinery/mapped-joinery';
import { invalidateJoineryReads } from '@/joinery/element-spec';
import { scheduleData } from '@/joinery/schedule-data';
import type { ElementFacts } from '@/joinery/symbol-mapping';
import type { JoineryHead, JoineryGlazingBars } from '@ifc-lite/create';

const MODEL = 'm';

interface Row { name: string; kind: 'elevation' | 'section'; plane: SectionPlaneConfig; drawing: Drawing2D }

/** A symbol as compared: its element, kind and every shape, to a micrometre. */
const shape = (s: OpeningSymbol) => JSON.parse(JSON.stringify({ id: s.id, kind: s.kind, shapes: s.shapes, heavy: s.heavy ?? [], dashed: s.dashed ?? [] }, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));
const sorted = (list: readonly OpeningSymbol[]) => [...list].sort((a, b) => a.id - b.id).map(shape);
const strokes = (s: OpeningSymbol) => s.shapes.length + (s.dashed?.length ?? 0) + (s.heavy?.length ?? 0);

describe('the engine draws the door and window symbols of the elevations and sections of AC20-FZK-Haus as the app does', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let rows: Row[];

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    const section = (name: string, axis: 'front' | 'side', offset: number): ProjectView => ({ id: name, kind: 'section', name, plane: { axis, offset, flipped: false }, createdAt: 0 }) as ProjectView;
    // Cut through the middle of a window's wall: -0.16 m is the south wall's (two windows and a door), 0.16 m the west wall's (windows).
    const views = [...set.document.views.filter((v) => v.kind === 'elevation'), section('Section through the south wall', 'front', -0.16), section('Section through the west wall', 'side', 0.16)];
    const drawings = await generateViewDrawings(views, engine.buildingMeshes, set.levels, engine.extent);
    rows = views.map((v) => ({ name: v.name, kind: v.kind as 'elevation' | 'section', plane: sectionConfigFor(v, set.levels, engine.extent!)!.plane, drawing: drawings.get(v.id)! }));
    assert.equal(rows.filter((r) => r.kind === 'elevation').length, 4, 'four elevations');
    assert.equal(rows.filter((r) => r.kind === 'section').length, 2, 'two sections');
    for (const r of rows) assert.ok(r.drawing, `${r.name} is drawn`);
  });
  beforeEach(() => { resetProject(); invalidateJoineryReads(); });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = (r: Row) => viewElevationSymbols(appMeshes(), r.plane, visibleEntities(r.drawing), new Set(), useProjectStore.getState().symbolFlips, 'fine');
  const eng = (r: Row) => {
    const { joineryTypes, joineryMapping, symbolFlips, openingLines } = useProjectStore.getState();
    return engineSymbols(engine.buildingMeshes, r.plane, r.drawing, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips, openingLines } }, undefined);
  };

  /** The engine's symbols per row, each row's equal to the app's. */
  function compare(): { row: Row; symbols: OpeningSymbol[] }[] {
    return rows.map((row) => {
      const a = app(row), e = eng(row);
      for (const k of ['door', 'window'] as const) assert.deepEqual(sorted(e.filter((s) => s.kind === k)), sorted(a.filter((s) => s.kind === k)), `${row.name}: ${k} symbols, engine vs app`);
      return { row, symbols: e };
    });
  }
  const of = (rs: { symbols: OpeningSymbol[] }[], kind: 'door' | 'window') => rs.flatMap((r) => r.symbols).filter((s) => s.kind === kind);
  /** The symbols of `kind` by row and element: an element is drawn on every row that sees it. */
  const keyed = (rs: { row: Row; symbols: OpeningSymbol[] }[], kind: 'door' | 'window') => new Map(rs.flatMap((r) => r.symbols.filter((s) => s.kind === kind).map((s) => [`${r.row.name}/${s.id}`, s] as const)));
  const windowFacts = (): ElementFacts[] =>
    scheduleData('window').entries.flatMap((e) => e.occurrences).map((o) => elementFacts(MODEL, o.expressId)).filter((f): f is ElementFacts => f !== null);
  /** Configures the type of every window of the model (each type once). */
  function configureWindows(extra: { head?: JoineryHead } = {}, opening: { fanlight?: boolean; bars?: JoineryGlazingBars } = {}): void {
    const seen = new Set<string>();
    for (const f of windowFacts()) {
      if (!f.typeGlobalId || seen.has(f.typeGlobalId)) continue;
      seen.add(f.typeGlobalId);
      configureElementType(f, { operations: ['tilt-turn-left', 'tilt-turn-right'], fanlight: opening.fanlight ?? false, ...(opening.bars ? { bars: opening.bars } : {}) }, extra);
    }
    assert.ok(seen.size >= 1, 'the windows have types to configure');
    invalidateJoineryReads();
  }

  it('the rows hold what they are about: elevations that see doors, and sections that cut a window and a door', () => {
    const elevations = rows.filter((r) => r.kind === 'elevation'), sections = rows.filter((r) => r.kind === 'section');
    assert.ok(elevations.every((r) => r.drawing.lines.length > 0 && r.drawing.cutPolygons.length === 0), 'an elevation cuts nothing');
    for (const r of sections) assert.ok(new Set(r.drawing.cutPolygons.filter((p) => p.ifcType === 'IfcWindow').map((p) => p.entityId)).size >= 2, `${r.name} cuts windows`);
    assert.ok(sections.some((r) => r.drawing.cutPolygons.some((p) => p.ifcType === 'IfcDoor')), 'a section cuts a door');
  });

  it('a door that states its operation draws its opening lines on the elevations (no configured type)', () => {
    const rs = compare();
    const doors = of(rs, 'door');
    assert.ok(doors.length >= 4, 'the doors the elevations see');
    assert.ok(doors.every((s) => strokes(s) > 0), 'each has opening lines');
    assert.ok(rs.filter((r) => r.row.kind === 'elevation' && r.symbols.some((s) => s.kind === 'door')).length >= 3, 'on most elevations');
    assert.ok(rs.some((r) => r.row.kind === 'section' && r.symbols.some((s) => s.kind === 'door')), 'a section that cuts a door draws its opening lines over the cut');
    // An unconfigured window has no type, so the elevation draws nothing for it (the app's rule).
    assert.equal(of(rs, 'window').length, 0);
  });

  it('a configured window type draws its frame, panels and opening lines on the elevations and on the section that cuts it', () => {
    configureWindows();
    const rs = compare();
    const windows = of(rs, 'window');
    assert.ok(windows.length >= 4 && windows.every((s) => s.shapes.length >= 4), 'windows with their frame, panes and marks');
    assert.ok(windows.some((s) => (s.dashed?.length ?? 0) > 0), 'the opening lines of a leaf that opens away are dashed');
    for (const r of rs.filter((x) => x.row.kind === 'section')) {
      const cut = new Set(r.row.drawing.cutPolygons.filter((p) => p.ifcType === 'IfcWindow').map((p) => p.entityId));
      assert.ok(r.symbols.some((s) => s.kind === 'window' && cut.has(s.id)), `${r.row.name}: a window the section cuts carries its symbol`);
    }
  });

  it('glazing bars divide the glass of each pane (#582)', () => {
    configureWindows();
    const plain = keyed(compare(), 'window');
    configureWindows({}, { bars: { horizontal: 2, vertical: 1 } });
    const barred = keyed(compare(), 'window');
    assert.ok(barred.size > 0 && barred.size === plain.size, 'the same windows');
    for (const [k, s] of barred) assert.ok(strokes(s) > strokes(plain.get(k)!), `window ${k} has more strokes with bars`);
  });

  it('an arched head rises over the window (#572)', () => {
    configureWindows();
    const plain = of(compare(), 'window');
    assert.ok(plain.every((s) => s.shapes.every((p) => p.type !== 'polyline' || p.pts.length < 40)), 'a square head has no arch');
    configureWindows({ head: { shape: 'round' } });
    const arched = of(compare(), 'window');
    assert.equal(arched.length, plain.length);
    assert.ok(arched.every((s) => s.shapes.some((p) => p.type === 'polyline' && p.pts.length >= 40)), 'every window outline follows the arch');
  });

  it('a transom row sits over the leaves', () => {
    configureWindows();
    const plain = keyed(compare(), 'window');
    configureWindows({}, { fanlight: true });
    const withTransom = keyed(compare(), 'window');
    assert.ok(withTransom.size > 0 && withTransom.size === plain.size, 'the same windows');
    for (const [k, s] of withTransom) assert.ok(s.shapes.length > plain.get(k)!.shapes.length, `window ${k} has its transom pane`);
  });

  it('the opening-line convention turns the lines the same way on both sides', () => {
    configureWindows();
    const handle = of(compare(), 'window');
    useProjectStore.setState({ openingLines: 'hinge' });
    const hinge = of(compare(), 'window');
    assert.equal(hinge.length, handle.length);
    assert.notDeepEqual(sorted(hinge), sorted(handle), 'the lines point the other way');
  });

  it('the project\'s flips turn a door the same way on both sides', () => {
    const plain = of(compare(), 'door');
    const guids = new Set(scheduleData('door').entries.flatMap((e) => e.occurrences).map((o) => elementFacts(MODEL, o.expressId)?.globalId).filter((g): g is string => !!g));
    assert.ok(guids.size >= 5);
    useProjectStore.setState({ symbolFlips: Object.fromEntries([...guids].map((g) => [g, 1])) });
    assert.notDeepEqual(sorted(of(compare(), 'door')), sorted(plain), 'the flips changed what is drawn');
  });
});
