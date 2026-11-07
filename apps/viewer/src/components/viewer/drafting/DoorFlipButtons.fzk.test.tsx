/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #679: the flip buttons on a selected door's plan symbol. A real door of AC20-FZK-Haus, drawn by the real symbol code on its ground
 * floor plan. A click on the symbol's button turns the drawn swing arc (or the hinge) exactly as the graphics bar's button does, a
 * window or no selection has no buttons, and the labels are in English and in Romanian.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { before, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcPoints } from '@bimvoice/ifcsheet';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { cleanup, click, render } from '@/test/render.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import type { DraftShape } from '@/drafting/types';
import { symbolShapes } from '@/drafting/opening-symbols';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { renderIdGlobalId } from '@/project/element-guid';
import { viewOpeningSymbols } from '@/project/view-symbols';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { FLIP_HINGE, FLIP_SWING } from '@/project/drawing-symbol-flips';
import type { ProjectLevel } from '@/project/types';
import { useViewerStore } from '@/store';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import type { MeshData } from '@ifc-lite/geometry';
import { ElementGraphicsBar } from './ElementGraphicsBar';
import { OpeningSymbolsLayer } from './OpeningSymbolsLayer';

const TRANSFORM = { x: 0, y: 0, scale: 40 };
const NONE: ReadonlySet<string> = new Set();

describe('flip a door from the buttons on its plan symbol (#679)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let meshes: MeshData[];
  let ground: ProjectLevel;
  let doorIds: number[];
  let windowIds: number[];

  const plane = () => viewPlaneConfig({ id: 'p', kind: 'plan', name: 'p', createdAt: 0, scale: 100, level: ground, cutHeight: 1.2 }, [ground], null)!;
  const select = (...ids: number[]) => act(() => useViewerStore.setState({ selectedEntityIds: new Set(ids), selectedEntityId: ids[0] ?? null } as never));
  const mount = () => render(<OpeningSymbolsLayer plane={plane()} hidden={NONE} level={ground} transform={TRANSFORM} axis="down" />);
  const symbolOf = (id: number) => viewOpeningSymbols(meshes, plane(), useProjectStore.getState().symbolFlips, NONE, 'fine', ground).find((s) => s.id === id)!;
  /** The drawn swing arc of a door: the points of its arcs, the side of the wall the leaf sweeps on. */
  const arcCentre = (id: number) => {
    const arcs = symbolShapes(symbolOf(id)).filter((s): s is Extract<DraftShape, { type: 'arc' }> => s.type === 'arc');
    assert.ok(arcs.length > 0, 'the door is drawn with a swing arc');
    const pts = arcs.flatMap((a) => arcPoints(a.c, a.r, a.start, a.end));
    return { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
  };
  const label = (ui: ParentNode, name: string) => ui.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement | null;

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    ground = [...useProjectStore.getState().levels].sort((a, b) => a.elevation - b.elevation)[0]!;
    meshes = [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    publishDrawingRuntime({ geometryResult: { meshes, coordinateInfo: useViewerStore.getState().geometryResult?.coordinateInfo } as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    const symbols = viewOpeningSymbols(meshes, plane(), undefined, NONE, 'fine', ground);
    doorIds = symbols.filter((s) => s.kind === 'door' && symbolShapes(s).some((x) => x.type === 'arc')).map((s) => s.id);
    windowIds = symbols.filter((s) => s.kind === 'window').map((s) => s.id);
    assert.ok(doorIds.length > 0 && windowIds.length > 0, 'the plan draws doors and windows');
  });
  beforeEach(() => {
    setLocale('en');
    useProjectStore.setState({ symbolFlips: {} });
    clearDraftHistory();
    select();
  });
  afterEach(() => cleanup());

  it('flips the drawn swing arc to the other side of the wall with the swing button', () => {
    const door = doorIds[0]!;
    const before = arcCentre(door);
    const ui = mount();
    select(door);
    click(label(ui, 'Flip swing')!);
    const guid = renderIdGlobalId(door)!;
    assert.equal(useProjectStore.getState().symbolFlips?.[guid], FLIP_SWING);
    const after = arcCentre(door);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 1e-3, 'the swing arc moved');
    // The drawn symbol in the DOM follows: the door is now in the accent group.
    assert.ok(ui.querySelector('[data-flipped-symbols] path')?.getAttribute('d'), 'the turned door is drawn');
  });

  it('flips the hinge to the other jamb with the hinge button', () => {
    const door = doorIds[0]!;
    const before = arcCentre(door);
    const ui = mount();
    select(door);
    click(label(ui, 'Flip hinge side')!);
    assert.equal(useProjectStore.getState().symbolFlips?.[renderIdGlobalId(door)!], FLIP_HINGE);
    const after = arcCentre(door);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 1e-3, 'the hinge moved with its arc');
  });

  it('writes the flips the graphics bar writes, one undo step each', () => {
    const door = doorIds[0]!;
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 10 } });
    clearDraftHistory();
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const bar = render(<ElementGraphicsBar viewId={plan.id} graphics={undefined} extraPatterns={[]} showHidden={false} onShowHidden={() => {}} pickingLine={false} onPickLine={() => {}} />);
    select(door);
    click([...bar.querySelectorAll('button')].find((b) => b.textContent === 'Flip swing')!);
    const viaBar = { ...useProjectStore.getState().symbolFlips };
    act(() => undoDrafts());
    assert.deepEqual(useProjectStore.getState().symbolFlips ?? {}, {}, 'undo clears the bar flip');
    cleanup();
    const ui = mount();
    select(door);
    click(label(ui, 'Flip swing')!);
    assert.deepEqual(useProjectStore.getState().symbolFlips, viaBar);
    act(() => undoDrafts());
    assert.deepEqual(useProjectStore.getState().symbolFlips ?? {}, {}, 'undo clears the symbol flip');
  });

  it('shows no buttons for a window, or with nothing selected', () => {
    const ui = mount();
    assert.equal(ui.querySelectorAll('[data-door-flip-buttons]').length, 0);
    select(windowIds[0]!);
    assert.equal(ui.querySelectorAll('[data-door-flip-buttons]').length, 0);
    select(doorIds[0]!);
    assert.equal(ui.querySelectorAll('[data-door-flip-buttons]').length, 1);
  });

  it('labels the buttons in Romanian', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    setLocale('ro');
    const ui = mount();
    select(doorIds[0]!);
    assert.ok(label(ui, 'Inversează sensul de deschidere'));
    assert.ok(label(ui, 'Inversează partea balamalelor'));
  });
});
