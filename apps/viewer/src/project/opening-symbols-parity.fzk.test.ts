/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless engine draws the door and window symbols of a plan as the app does (#587). AC20-FZK-Haus is loaded into the app's
 * stores and its own geometry (the Wall's path: `viewOpeningSymbols` over the loaded meshes, the project store's types, flips and
 * the stated swings) and opened by the engine (`planOpeningSymbols` over `openModel`'s meshes and the project's facts); on each
 * storey's plan the symbols of the two must be the same shapes. A comparison with no door or window in it is no comparison, so every
 * case first asserts that its rows have symbols of the kind it is about.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, planOpeningSymbols, type OpeningSymbol } from '@bimvoice/ifcsheet';
import { openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { readDxfBlock } from '@bimvoice/ifcsheet/project';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { viewOpeningSymbols } from './view-symbols';
import { configureElementType, setTypePlanBlock } from '@/joinery/type-config-actions';
import { elementFacts } from '@/joinery/mapped-joinery';
import { invalidateJoineryReads } from '@/joinery/element-spec';
import { scheduleData } from '@/joinery/schedule-data';
import type { ElementFacts } from '@/joinery/symbol-mapping';

const DXF = readFileSync(new URL('../../../../packages/ifcsheet/src/__fixtures__/door-window-blocks.dxf', import.meta.url), 'utf8');
const MODEL = 'm';

type Level = Parameters<typeof planOpeningSymbols>[4];
interface Row { storey: string; plane: SectionPlaneConfig; level: Level }

/** A symbol as compared: its element, kind and every shape, to a micrometre. */
const shape = (s: OpeningSymbol) => JSON.parse(JSON.stringify({ id: s.id, kind: s.kind, shapes: s.shapes, heavy: s.heavy ?? [], dashed: s.dashed ?? [] }, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)));
const sorted = (list: readonly OpeningSymbol[]) => [...list].sort((a, b) => a.id - b.id).map(shape);

describe('the engine draws the door and window symbols of AC20-FZK-Haus as the app does', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let rows: Row[];

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    rows = set.document.views.filter((v) => v.kind === 'plan').map((v) => ({ storey: v.name, plane: sectionConfigFor(v, set.levels, engine.extent!)!.plane, level: v.level }));
    assert.ok(rows.length >= 2, 'a plan for each storey');
  });
  beforeEach(() => { resetProject(); invalidateJoineryReads(); });

  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = (plane: SectionPlaneConfig) => viewOpeningSymbols(appMeshes(), plane, useProjectStore.getState().symbolFlips, new Set(), 'fine');
  const eng = (plane: SectionPlaneConfig, level: Level) => {
    const { joineryTypes, joineryMapping, symbolFlips } = useProjectStore.getState();
    return planOpeningSymbols(engine.buildingMeshes, plane, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: joineryTypes ?? [], joineryMapping: joineryMapping!, symbolFlips } }, undefined, level);
  };

  /** The engine's symbols per storey, each storey's equal to the app's; the rows must hold `kind` symbols somewhere. */
  function compare(kind: 'door' | 'window'): { storey: string; symbols: OpeningSymbol[] }[] {
    const out = rows.map((r) => ({ storey: r.storey, symbols: eng(r.plane, r.level) }));
    for (const r of rows) {
      const a = app(r.plane), e = eng(r.plane, r.level);
      for (const k of ['door', 'window'] as const) assert.deepEqual(sorted(e.filter((s) => s.kind === k)), sorted(a.filter((s) => s.kind === k)), `${r.storey}: ${k} symbols, engine vs app`);
    }
    assert.ok(out.some((o) => o.symbols.some((s) => s.kind === kind)), `the plans hold ${kind} symbols`);
    return out;
  }
  const all = (rs: { symbols: OpeningSymbol[] }[], kind: 'door' | 'window') => rs.flatMap((r) => r.symbols).filter((s) => s.kind === kind);
  const facts = (kind: 'door' | 'window'): ElementFacts[] =>
    scheduleData(kind).entries.flatMap((e) => e.occurrences).map((o) => elementFacts(MODEL, o.expressId)).filter((f): f is ElementFacts => f !== null);
  const biggestType = (list: ElementFacts[]): ElementFacts[] => {
    const byType = new Map<string, ElementFacts[]>();
    for (const f of list) if (f.typeGlobalId) byType.set(f.typeGlobalId, [...(byType.get(f.typeGlobalId) ?? []), f]);
    return [...byType.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  };

  it('door swings (the leaf, the arc, the stated operation) and window opening lines, on every storey', () => {
    const rs = compare('door');
    assert.ok(all(rs, 'door').length >= 5, 'the five doors of the house');
    assert.ok(all(rs, 'door').every((s) => s.heavy!.length > 0 && s.shapes.length > 0), 'each door has its leaf and its swing');
    assert.ok(all(rs, 'window').length >= 1 && all(rs, 'window').every((s) => s.shapes.length > 0), 'windows have their lines');
    assert.ok(rs.filter((r) => r.symbols.length > 0).length >= 2, 'both storeys have symbols');
  });

  it('the project\'s flips turn a door; the engine turns the same ones', () => {
    const plain = all(compare('door'), 'door');
    const guids = new Set(facts('door').map((f) => f.globalId!));
    assert.ok(guids.size >= 5);
    useProjectStore.setState({ symbolFlips: Object.fromEntries([...guids].map((g) => [g, 1])) });
    const turned = compare('door');
    assert.notDeepEqual(sorted(all(turned, 'door')), sorted(plain), 'the flips changed what is drawn');
  });

  it('a configured window type (tilt-turn leaves) draws its configured entry, heavy frame and opening lines', () => {
    const plain = all(compare('window'), 'window');
    assert.ok(plain.every((s) => !s.heavy), 'unconfigured windows are read from their meshes, nothing heavy');
    const type = biggestType(facts('window'));
    assert.ok(type.length >= 2, 'a window type of several windows');
    configureElementType(type[0], { operations: ['tilt-turn-left', 'tilt-turn-right'], fanlight: false });
    invalidateJoineryReads();
    const rs = compare('window');
    const configured = new Set(type.map((f) => f.globalId));
    const ids = new Set(scheduleData('window').entries.flatMap((e) => e.occurrences).filter((o) => configured.has(o.globalId)).map((o) => o.expressId));
    const typed = all(rs, 'window').filter((s) => ids.has(s.id));
    assert.ok(typed.length > 0, 'the type\'s windows are on the plans');
    assert.ok(typed.every((s) => (s.heavy?.length ?? 0) > 0), 'drawn with the configured entry: its frame is heavy');
    assert.notDeepEqual(sorted(typed), sorted(plain.filter((s) => ids.has(s.id))));
  });

  it('a configured door type, and the DXF block it takes as its plan symbol (#584)', () => {
    const type = biggestType(facts('door'));
    assert.ok(type.length >= 1);
    configureElementType(type[0], { operations: ['swing-left'], fanlight: false });
    invalidateJoineryReads();
    const ids = new Set(scheduleData('door').entries.flatMap((e) => e.occurrences).filter((o) => type.some((f) => f.globalId === o.globalId)).map((o) => o.expressId));
    const generated = all(compare('door'), 'door').filter((s) => ids.has(s.id));
    assert.ok(generated.length > 0, 'the type\'s doors are on the plans');
    const block = readDxfBlock(DXF, 'DOOR90').symbol;
    assert.ok(block, 'the fixture holds the DOOR90 block');
    setTypePlanBlock(type[0], block);
    invalidateJoineryReads();
    const custom = all(compare('door'), 'door').filter((s) => ids.has(s.id));
    assert.equal(custom.length, generated.length);
    // The block: its one closed leaf heavy, its swing arc thin, nothing dashed; not the generated symbol.
    assert.ok(custom.every((s) => s.heavy!.length === 1 && s.shapes.length === 1 && s.dashed!.length === 0), 'the block\'s own strokes');
    assert.notDeepEqual(sorted(custom), sorted(generated));
  });
});
