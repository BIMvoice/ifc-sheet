/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #656, on AC20-FZK-Haus, through IfcSheet's face (`IfcSheetShell`), where the engine's properties panel and schedule tab are covered:
 * (a) a door or window selected in a stepped drawing offers "Opening and symbol", which opens the type's opening form (leaves, fanlight,
 * plan symbol) and the symbol choice as a card, saved in the project and not in the model; (b) the door and window schedule's card offers
 * "Open to draw in", which steps into the type's view, where a drawn line is kept on the type.
 */
import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, click, render, waitFor } from '@/test/render.js';
import { loadUrbanModel, urbanWasm, wasmMeshes } from '@/test/urban-fixture';
import { useViewerStore } from '@/store';
import { projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { startDrawingSet, hangSchedule } from '@/project/drawing-set-actions';
import { paperOf } from '@/project/sheets';
import { clearDraftHistory } from '@/drafting/draft-store';
import { cancelCommand, clickDrawing, pressEnter, useDraftingSession } from '@/drafting/session';
import { addSchedule } from '@/joinery/schedules';
import { elementFacts } from '@/joinery/mapped-joinery';
import { configureElementType, typeOpeningOf } from '@/joinery/type-config-actions';
import { joineryDraftViewId } from '@/joinery/view-draft-id';
import { IfcSheetShell } from './IfcSheetShell.js';
import { stepInto, useWallNav } from '../wall/wall-nav.js';

const FZK = resolve(import.meta.dirname, '../../../test/__fixtures__/AC20-FZK-Haus.ifc');
const HOUSE = { min: { x: -2, y: -1, z: -2 }, max: { x: 14, y: 8, z: 12 } };
const TYPED_DOOR = 17468; // Innentuer-1, defined by an IfcDoorType
const labelled = (root: ParentNode, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  assert.ok(found, `a button "${text}" (buttons: ${[...root.querySelectorAll('button')].map((b) => b.textContent?.trim()).join(' | ')})`);
  return found;
};
const select = (...ids: number[]) => act(() => useViewerStore.setState({ selectedEntityIds: new Set(ids), selectedEntityId: ids[0] ?? null } as never));
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const meshesOf = (model: { geometryResult?: { meshes: { positions: Float32Array; origin?: number[] }[] } | null }) => model.geometryResult?.meshes ?? [];

let bytes: Uint8Array;

/** The schedule's views are cut away from the middle of the building, as the loader states it. */
async function withBounds(): Promise<void> {
  const model = useViewerStore.getState().models.get('fzk')!;
  const xs: number[] = [], zs: number[] = [];
  for (const m of meshesOf(model)) for (let i = 0; i < m.positions.length; i += 3) { xs.push(m.positions[i] + (m.origin?.[0] ?? 0)); zs.push(m.positions[i + 2] + (m.origin?.[2] ?? 0)); }
  const bounds = { min: { x: Math.min(...xs), y: 0, z: Math.min(...zs) }, max: { x: Math.max(...xs), y: 0, z: Math.max(...zs) } };
  useViewerStore.setState({ models: new Map([['fzk', { ...model, geometryResult: { ...model.geometryResult!, coordinateInfo: { shiftedBounds: bounds } } } as never]]) });
}

/** Start from the house alone; false (the test is skipped) when the wasm runtime is not built. */
async function begin(t: TestContext): Promise<boolean> {
  if (!urbanWasm(t)) return false;
  bytes = new Uint8Array(readFileSync(FZK));
  resetProject();
  clearDraftHistory();
  await loadUrbanModel('fzk', bytes);
  await withBounds();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  return true;
}
afterEach(() => {
  cleanup();
  cancelCommand();
  useViewerStore.setState({ models: new Map(), selectedEntityIds: new Set<number>(), selectedEntityId: null } as never);
});

/** The ids of the model's windows and doors, with whether the model gives each an IFC type. */
function joinery(): { id: number; kind: 'door' | 'window'; typed: boolean }[] {
  const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
  const out: { id: number; kind: 'door' | 'window'; typed: boolean }[] = [];
  for (const id of store.entityIndex.byId.keys()) {
    const f = elementFacts('fzk', id);
    if (f) out.push({ id, kind: f.kind, typed: f.typeGlobalId !== null });
  }
  return out;
}

/** Reload the house without the IfcRelDefinesByType that gives `elementId` its type. */
async function loadWithoutType(elementId: number): Promise<void> {
  const text = new TextDecoder().decode(bytes).split('\n').filter((line) => !(line.includes('IFCRELDEFINESBYTYPE') && line.includes(`(#${elementId})`))).join('\n');
  await loadUrbanModel('fzk', new TextEncoder().encode(text), wasmMeshes(bytes));
  await withBounds();
}

async function stepIntoPlan(): Promise<HTMLElement> {
  startDrawingSet(null, HOUSE);
  const s = useProjectStore.getState();
  const plan = s.views.find((v) => v.kind === 'plan')!;
  const sheet = s.sheets.find((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === plan.id))!;
  const ui = render(<IfcSheetShell />);
  act(() => stepInto(sheet.id, plan.id));
  await wait();
  return ui;
}

describe('a door or window selected in a stepped drawing (#656, a)', () => {
  it('offers "Opening and symbol", and the card holds the opening form, the leaves, the fanlight and the symbol choice', async (t) => {
    if (!(await begin(t))) return;
    const ui = await stepIntoPlan();
    select(TYPED_DOOR);
    await wait();
    const bar = ui.querySelector<HTMLElement>('[data-element-graphics-bar]')!;
    assert.ok(bar, 'the drawing is in front with its bar');
    click(labelled(bar, 'Opening and symbol'));
    const card = ui.querySelector<HTMLElement>('[data-opening-card]');
    assert.ok(card, 'the card is up');
    assert.ok(card.querySelector('[data-joinery-symbol]'), 'the symbol choice');
    assert.ok(card.querySelector('[data-type-opening]'), 'the opening form');
    assert.ok(card.querySelector('[data-type-leaf="0"]'), 'a leaf');
    assert.ok([...card.querySelectorAll('label')].some((l) => l.textContent?.includes('transom')), 'the fanlight');
    assert.ok(card.querySelector('[data-type-plan-block]'), 'the plan symbol');
  });

  it('keeps what is set in the project file and leaves the model alone', async (t) => {
    if (!(await begin(t))) return;
    const ui = await stepIntoPlan();
    select(TYPED_DOOR);
    await wait();
    click(labelled(ui.querySelector<HTMLElement>('[data-element-graphics-bar]')!, 'Opening and symbol'));
    const card = ui.querySelector<HTMLElement>('[data-opening-card]')!;
    const two = card.querySelector<HTMLInputElement>('[data-type-opening] input[type="radio"][value="2"]');
    assert.ok(two, 'two leaves is offered');
    click(two);
    click(card.querySelector<HTMLElement>('[data-type-opening-apply]')!);
    const typed = useProjectStore.getState().joineryTypes ?? [];
    assert.equal(typed.length, 1, 'the type is configured in the project');
    assert.equal(typeOpeningOf(elementFacts('fzk', TYPED_DOOR)!)?.operations.length, 2, 'with two leaves');
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    assert.deepEqual(reopened.joineryTypes, useProjectStore.getState().joineryTypes, 'it comes back from the saved file');
    assert.equal(useViewerStore.getState().mutationViews.size, 0, 'the model was not edited');
  });

  it('shows a window or door the model gives no type a symbol choice and says why there is no opening form, not a dead card', async (t) => {
    if (!(await begin(t))) return;
    // The same house with the first door's IfcRelDefinesByType taken out: a door from a tool that wrote no type.
    await loadWithoutType(TYPED_DOOR);
    const untyped = joinery().find((j) => j.id === TYPED_DOOR);
    assert.ok(untyped && !untyped.typed, 'the door has no IFC type');
    const ui = await stepIntoPlan();
    select(untyped.id);
    await wait();
    click(labelled(ui.querySelector<HTMLElement>('[data-element-graphics-bar]')!, 'Opening and symbol'));
    const card = ui.querySelector<HTMLElement>('[data-opening-card]')!;
    assert.ok(card.querySelector('[data-joinery-symbol]'), 'the symbol choice is there');
    assert.ok(card.querySelector('[data-joinery-untyped]'), 'and the reason there is no opening form');
  });

  it('is not offered for a wall, or for two elements', async (t) => {
    if (!(await begin(t))) return;
    const ui = await stepIntoPlan();
    const store = useViewerStore.getState().models.get('fzk')!.ifcDataStore!;
    const wall = [...store.entityIndex.byId.keys()].find((id) => String(store.entities.getTypeName(id)).toUpperCase().startsWith('IFCWALL'))!;
    select(wall);
    await wait();
    assert.ok(![...ui.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Opening and symbol'));
    const doors = joinery().filter((j) => j.kind === 'door').slice(0, 2).map((j) => j.id);
    select(...doors);
    await wait();
    assert.ok(![...ui.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Opening and symbol'));
  });
});

/** The schedule of the model's windows, hung on a sheet and stepped into, with its viewport's card open. */
async function openScheduleCard(): Promise<HTMLElement> {
  startDrawingSet(null, HOUSE);
  const id = addSchedule('window', 'Windows');
  const sheetId = hangSchedule(id)!;
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  const ui = render(<IfcSheetShell />);
  act(() => stepInto(sheetId));
  await wait();
  const k = Math.min((1280 - 24) / paperOf(sheet).w, (800 - 24) / paperOf(sheet).h);
  const vp = sheet.viewports![0];
  const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]')!;
  assert.ok(canvas, 'the sheet is in front');
  act(() => {
    canvas.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, clientX: (1280 - paperOf(sheet).w * k) / 2 + vp.x * k, clientY: (800 - paperOf(sheet).h * k) / 2 + vp.y * k }));
  });
  return ui;
}

describe('the door and window schedule on its sheet (#656, b)', () => {
  it('says what to do first while no type has views, instead of offering nothing to open', async (t) => {
    if (!(await begin(t))) return;
    const ui = await openScheduleCard();
    const section = ui.querySelector<HTMLElement>('[data-joinery-draw-in]');
    assert.ok(section, 'the schedule card has the section');
    assert.ok(section.textContent?.includes('Opening and symbol'), 'it names the way to give a type its views');
    assert.ok(![...section.querySelectorAll('button')].some((b) => b.textContent === 'Open to draw in'));
  });

  it('offers "Open to draw in", which steps into the type\'s view, and a line drawn there is kept on the type', async (t) => {
    if (!(await begin(t))) return;
    const win = joinery().find((j) => j.kind === 'window' && j.typed)!;
    configureElementType(elementFacts('fzk', win.id)!, { operations: ['fixed'], fanlight: false });
    const ui = await openScheduleCard();
    const section = ui.querySelector<HTMLElement>('[data-joinery-draw-in]');
    assert.ok(section, 'the schedule card offers the way in');
    await waitFor(() => [...section.querySelectorAll('button')].some((b) => b.textContent === 'Open to draw in' && !b.disabled), 'the types\' views are cut');
    click(labelled(section, 'Open to draw in'));
    await wait(100);
    const host = ui.querySelector<HTMLElement>('[data-joinery-drafting]');
    assert.ok(host, 'the type\'s view is in front');
    const [typeId, view] = host.getAttribute('data-joinery-drafting')!.split(':');
    assert.equal(view, 'front');
    const viewId = joineryDraftViewId(typeId, 'front');
    // The rail's Line tool runs on that view, and two clicks and Enter draw a line on it.
    click(labelled(ui.querySelector('nav')!, 'Line'));
    await wait(100);
    assert.equal(useDraftingSession.getState().viewId, viewId, 'the tool is on the type\'s view');
    act(() => { clickDrawing({ x: 0, y: 0 }, 0.01, false); clickDrawing({ x: 0.5, y: 0.5 }, 0.01, false); pressEnter(); });
    const entry = (useProjectStore.getState().joineryTypes ?? []).find((t) => t.id === typeId);
    assert.equal(entry?.view?.drafts?.front?.length, 1, 'the line is saved on the type');
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    assert.equal(reopened.joineryTypes?.find((t) => t.id === typeId)?.view?.drafts?.front?.length, 1, 'and comes back from the saved file');
    click(labelled(host, 'Back to the schedule'));
    await wait();
    assert.equal(ui.querySelector('[data-joinery-drafting]'), null, 'back on the sheet');
    assert.ok(ui.querySelector('[data-sheet-canvas]'));
  });
});
