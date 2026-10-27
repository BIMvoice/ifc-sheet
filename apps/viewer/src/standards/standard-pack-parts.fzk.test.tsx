/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The numbering and the material hatches of the standards packs (#365) on AC20-FZK-Haus: installing a pack on a fresh
 * project writes the pack's numbering scheme and its material rows, the sheets read both from where they always did,
 * and one undo (or "Reset") puts the project's own values back. The Romanian and the German pack differ in the material
 * names they hatch.
 *
 * The rows of a pack match a material by its exact name (the table's rule, #90), and the model's own material names
 * ("Leichtbeton 102890359") are not the pack's generic ones, so the drawing check renames one shipped row to the name the
 * model's walls carry and installs that pack: it proves a pack row reaches the sheet, not that FZK's walls match a shipped name.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { resolvedMaterial } from '@bimvoice/ifcsheet/materials';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { useSheetContent, type SheetContent } from '@/components/viewer/sheets/useSheetContent';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { DEFAULT_SCHEME, SEQUENTIAL_SCHEME } from '@/project/numbering';
import { materialGraphics } from '@/project/materials';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { addProjectSheet, resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { modelLevels } from '@/project/model-levels';
import { useViewDrawings } from '@/project/view-drawings';
import type { StyledDrawing } from '@/project/view-graphics';
import type { ProjectSheet } from '@/project/types';
import { germanyPack, romaniaPack, type StandardPack } from './standard-pack';
import { installStandard, isApplied, resetStandard } from './standard-pack-install';

const skip = planModelMissing(FZK_HAUS);
const t = (key: string): string => key;
const ro = (): StandardPack => romaniaPack(t as never);
const de = (): StandardPack => germanyPack();
const state = () => useProjectStore.getState();
/** What the model's walls are made of. */
const WALL_MATERIAL = 'Leichtbeton 102890359';

/** The number a sheet made now takes. */
const newSheetNumber = (name: string): string => { const id = addProjectSheet(name, 'plans'); return state().sheets.find((x) => x.id === id)!.number; };

/** The hatch a material resolves to in the project now: what the sheets and the swatch read. */
const hatchOf = (name: string): string | null => resolvedMaterial(materialGraphics(name)).hatch;

let m: LoadedPlanModel;
const drawings: Record<string, Drawing2D> = {};
const hooks = new Map<string, SheetContent>();
function Probe({ sheet }: { sheet: ProjectSheet }) {
  hooks.set(sheet.id, useSheetContent(sheet));
  return null;
}
const sheetsWithViews = (): ProjectSheet[] => state().sheets.filter((s) => (s.viewports ?? []).some((vp) => drawings[vp.viewId]));
/** The hatch patterns the walls are drawn with on the built sheets. */
function wallHatches(): string[] {
  const out: string[] = [];
  for (const sheet of sheetsWithViews()) for (const vp of sheet.viewports ?? []) {
    if (!drawings[vp.viewId]) continue;
    for (const h of (hooks.get(sheet.id)!.content(vp).drawing as StyledDrawing)?.materialHatches ?? []) if (h.entityId !== undefined && m.classOf(h.entityId).startsWith('IfcWall')) out.push(h.pattern);
  }
  return out;
}
const mountAll = (): void => void render(<>{sheetsWithViews().map((s) => <Probe key={s.id} sheet={s} />)}</>);

before(async () => {
  if (skip) return;
  m = await loadPlanModel(FZK_HAUS);
  resetProject();
  syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
  const model = useViewerStore.getState().models.get('m')!;
  startDrawingSet(model.geometryResult!.meshes, model.geometryResult!.coordinateInfo.shiftedBounds);
  for (const view of state().views) {
    if (view.kind !== 'plan' && view.kind !== 'elevation' && view.kind !== 'section') continue;
    drawings[view.id] = await m.planOf(view, { omits: 'none' });
  }
});
beforeEach(() => {
  if (skip) return;
  useProjectStore.setState({ materials: [], sheetNumbering: undefined, installedStandard: undefined, dirty: false });
  clearDraftHistory();
  useViewDrawings.setState({ byView: Object.fromEntries(Object.entries(drawings).map(([id, drawing]) => [id, { drawing, status: 'ready', progress: 100, phase: '', error: null }])) });
});
afterEach(() => { cleanup(); hooks.clear(); });

describe('the Romanian pack sets numbering and material hatches (#365)', { skip }, () => {
  it('on a fresh project the numbering and the hatches of two materials change to the pack\'s values', () => {
    assert.equal(state().sheetNumbering, undefined);
    assert.equal(hatchOf('Cărămidă'), null, 'the name guess knows "caramid", not the diacritic spelling');
    assert.equal(hatchOf('Oțel'), null);
    installStandard(ro());
    assert.deepEqual(state().sheetNumbering, DEFAULT_SCHEME);
    assert.equal(hatchOf('Cărămidă'), 'BRICK');
    assert.equal(hatchOf('Oțel'), 'STEEL');
    assert.equal(materialGraphics('Cărămidă').auto, false, 'a row of the project\'s own now');
    assert.equal(resolvedMaterial(materialGraphics('Termoizolație')).fill, 'none');
    assert.equal(isApplied(ro()), true);
    assert.deepEqual(state().installedStandard?.previous.materials, [], 'a fresh project holds an empty table');
    assert.deepEqual(state().installedStandard?.previous.sheetNumbering, null);
  });

  it('the sheets show them: a sheet made after the install takes the pack\'s scheme over the project\'s own, and a cut wall draws the pack\'s hatch', () => {
    useProjectStore.setState({ sheetNumbering: SEQUENTIAL_SCHEME });
    assert.equal(newSheetNumber('Before'), 'A01');
    installStandard(ro());
    const after = newSheetNumber('After');
    assert.match(after, /^A-\d{3}$/, `the pack's pattern, not the project's A01: ${after}`);
    // The shipped rows carry generic names; the walls carry the model's own, so the pack is given a row of that name.
    const [concrete] = ro().materials!.filter((r) => r.name === 'Beton');
    const forFzk: StandardPack = { ...ro(), materials: [{ ...concrete, id: 'pack:test:fzk-wall', name: WALL_MATERIAL, hatch: 'BRICK' }] };
    mountAll();
    assert.deepEqual(wallHatches(), [], 'no material hatch before');
    act(() => installStandard(forFzk));
    const drawn = wallHatches();
    assert.ok(drawn.length > 0 && drawn.every((p) => p === 'BRICK'), `the walls are hatched with the pack's pattern: ${[...new Set(drawn)].join(', ')}`);
  });

  it('one undo puts the numbering and the hatches back, and so does reset', () => {
    useProjectStore.setState({ sheetNumbering: SEQUENTIAL_SCHEME, materials: [{ id: 'mine', name: 'Cărămidă', hatch: 'CROSS' }] });
    clearDraftHistory();
    installStandard(ro());
    assert.deepEqual(state().sheetNumbering, DEFAULT_SCHEME);
    assert.equal(hatchOf('Cărămidă'), 'BRICK');
    assert.equal(undoDrafts(), true);
    assert.deepEqual(state().sheetNumbering, SEQUENTIAL_SCHEME);
    assert.deepEqual(state().materials, [{ id: 'mine', name: 'Cărămidă', hatch: 'CROSS' }]);
    assert.equal(undoDrafts(), false, 'one step');
    installStandard(ro());
    assert.equal(resetStandard(), true);
    assert.deepEqual(state().sheetNumbering, SEQUENTIAL_SCHEME);
    assert.deepEqual(state().materials, [{ id: 'mine', name: 'Cărămidă', hatch: 'CROSS' }]);
  });

  it('keeps the project\'s other material rows, and a fresh project\'s table goes back to empty', () => {
    useProjectStore.setState({ materials: [{ id: 'x', name: 'Granit', hatch: 'GRAVEL' }] });
    installStandard(ro());
    assert.equal(hatchOf('Granit'), 'GRAVEL');
    assert.equal(resetStandard(), true);
    assert.deepEqual(state().materials, [{ id: 'x', name: 'Granit', hatch: 'GRAVEL' }]);
    useProjectStore.setState({ materials: [], installedStandard: undefined });
    installStandard(ro());
    resetStandard();
    assert.deepEqual(state().materials, []);
    assert.equal(state().sheetNumbering, undefined);
  });
});

describe('the German pack differs from the Romanian one (#365)', { skip }, () => {
  it('hatches the German names, not the Romanian ones, with the same numbering', () => {
    installStandard(de());
    assert.equal(hatchOf('Mauerwerk'), 'BRICK');
    assert.equal(hatchOf('Dämmung'), 'INSULATION');
    assert.equal(hatchOf('Stahl'), 'STEEL');
    assert.equal(materialGraphics('Mauerwerk').auto, false);
    assert.equal(materialGraphics('Cărămidă').auto, true, 'the Romanian names are the Romanian pack\'s');
    assert.equal(hatchOf('Cărămidă'), null);
    assert.deepEqual(state().sheetNumbering, DEFAULT_SCHEME);
    assert.equal(state().installedStandard?.id, 'de-din');
    assert.notDeepEqual(de().materials!.map((r) => r.name), ro().materials!.map((r) => r.name));
  });
});
