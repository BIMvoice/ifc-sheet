/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bar of the drawing in front for single elements (#32, #33), and the card section beside it: select elements, "Hide in this
 * view", "Graphics for this element…", "Show hidden" and the ghost you click to bring back, the list on the drawing's card with its
 * orphans. Each action is one undo step. In English and in Romanian.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { useViewerStore } from '@/store';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { showElements } from '@/project/element-graphics-actions';
import { hiddenGhosts } from '@/project/view-element-filter';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import type { ProjectView, ViewGraphics } from '@/project/types';
import { HiddenElementsSection } from '../wall/HiddenElementsSection';
import { ElementGraphicsBar } from './ElementGraphicsBar';
import { HiddenGhostLayer } from './HiddenGhostLayer';

const WALL_A = '2O2Fr$t4X7Zf8NOew3FLOH';
const WALL_B = '3cUkl32yn9qRSPvBJVyWYp';
const GONE = '0000000000000000000000';
const GUIDS: Record<number, string> = { 11: WALL_A, 12: WALL_B };
const NAMES: Record<number, string> = { 11: 'Basement wall', 12: 'Garden wall' };

/** A model of two walls, express ids 11 and 12, renderer ids the same (offset 0). */
function loadModel(guids: Record<number, string> = GUIDS): void {
  const entities = { getGlobalId: (id: number) => guids[id] ?? '', getName: (id: number) => NAMES[id] ?? '', getTypeName: () => 'IfcWall' };
  const entityIndex = { byId: new Map(Object.keys(guids).map((id) => [Number(id), {}])), byType: new Map() };
  useViewerStore.setState({
    models: new Map([['m', { id: 'm', name: 'm', ifcDataStore: { entities, entityIndex }, geometryResult: { meshes: [] }, visible: true, idOffset: 0, maxExpressId: 100 }]]),
    selectedEntityIds: new Set<number>(), selectedEntityId: null, mutationVersion: 1,
  } as never);
}
const select = (...ids: number[]) => act(() => useViewerStore.setState({ selectedEntityIds: new Set(ids), selectedEntityId: ids[0] ?? null } as never));

const plan = (): ProjectView => useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
const graphics = (): ViewGraphics | undefined => useProjectStore.getState().views.find((v) => v.id === plan().id)?.graphics;
const button = (ui: ParentNode, name: string): HTMLButtonElement => {
  const found = [...ui.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name);
  assert.ok(found, `a button "${name}" (buttons: ${[...ui.querySelectorAll('button')].map((b) => b.textContent).join(' | ')})`);
  return found as HTMLButtonElement;
};

function Bar({ showHidden = false, pickingLine = false }: { showHidden?: boolean; pickingLine?: boolean }) {
  const v = useProjectStore((s) => s.views.find((x) => x.id === plan().id)!);
  return <ElementGraphicsBar viewId={v.id} graphics={v.graphics} extraPatterns={[]} showHidden={showHidden} onShowHidden={() => {}} pickingLine={pickingLine} onPickLine={() => {}} />;
}

beforeEach(() => {
  setLocale('en');
  resetProject();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }]);
  startDrawingSet(null, { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } });
  clearDraftHistory();
  loadModel();
});
afterEach(() => cleanup());

describe('select elements in the drawing, hide them in this view', () => {
  it('offers the two actions for the selection, and nothing to hide with nothing selected', () => {
    const ui = render(<Bar />);
    assert.ok(!ui.textContent?.includes('Hide in this view'));
    select(11);
    assert.ok(ui.textContent?.includes('One element selected'));
    button(ui, 'Hide in this view');
    button(ui, 'Graphics for this element…');
    select(11, 12);
    assert.ok(ui.textContent?.includes('2 elements selected'));
    button(ui, 'Graphics for these elements…');
  });

  it('"Hide in this view" hides the selected elements by GlobalId, in one undo step', () => {
    const ui = render(<Bar />);
    select(11, 12);
    click(button(ui, 'Hide in this view'));
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A, WALL_B]);
    assert.equal(undoDrafts(), true);
    assert.equal(graphics(), undefined);
    assert.equal(undoDrafts(), false, 'it was one step');
  });
});

describe('"Graphics for this element…"', () => {
  const change = (el: Element, value: string) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new window.Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  const field = (ui: ParentNode, label: string) => (ui.querySelector(`[data-element-graphics-panel] [aria-label="${label}"]`) ?? [...ui.querySelectorAll('[data-element-graphics-panel] label')].find((l) => l.textContent?.startsWith(label))?.querySelector('select')) as HTMLElement;

  it('opens a panel; a line style, a weight and a hatch are each one undo step, and apply to every selected element', () => {
    const ui = render(<Bar />);
    select(11, 12);
    click(button(ui, 'Graphics for these elements…'));
    assert.ok(ui.querySelector('[data-element-graphics-panel]'));
    change(field(ui, 'Line style'), 'dashed');
    assert.equal(graphics()?.elements?.[WALL_A]?.lineStyle, 'dashed');
    assert.equal(graphics()?.elements?.[WALL_B]?.lineStyle, 'dashed');
    assert.equal(graphics()?.elements?.[WALL_A]?.about, 'IfcWall Basement wall', 'the element is recognisable if the model loses it');
    change(field(ui, 'Line weight, cut'), 'heavy');
    change(field(ui, 'Line weight, seen beyond the cut'), 'hairline');
    assert.equal(graphics()?.elements?.[WALL_A]?.cutWeight, 'heavy');
    assert.equal(graphics()?.elements?.[WALL_A]?.projectionWeight, 'hairline');
    // Each change was a step of its own, and undoing the last leaves the others.
    assert.equal(undoDrafts(), true);
    assert.equal(graphics()?.elements?.[WALL_A]?.projectionWeight, undefined);
    assert.equal(graphics()?.elements?.[WALL_A]?.cutWeight, 'heavy');
  });

  it('a colour is one step when the picker closes, not one per step of the drag', () => {
    const ui = render(<Bar />);
    select(11);
    click(button(ui, 'Graphics for this element…'));
    const colour = field(ui, 'Line colour') as HTMLInputElement;
    change(colour, '#123456');
    change(colour, '#223344');
    assert.equal(graphics(), undefined, 'dragging in the picker writes nothing');
    act(() => colour.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(graphics()?.elements?.[WALL_A]?.lineColor, '#223344');
    assert.equal(undoDrafts(), true);
    assert.equal(graphics(), undefined);
  });

  it('Reset takes the element\'s overrides off in one step', () => {
    const ui = render(<Bar />);
    select(11);
    click(button(ui, 'Graphics for this element…'));
    change(field(ui, 'Line style'), 'dashed');
    change(field(ui, 'Line weight, cut'), 'light');
    click(button(ui, 'Reset'));
    assert.equal(graphics(), undefined);
    assert.equal(undoDrafts(), true);
    assert.equal(graphics()?.elements?.[WALL_A]?.cutWeight, 'light');
  });
});

describe('show hidden', () => {
  it('counts what is hidden, offers "Show all" in one undo step, and lists the ghost to click back', () => {
    const [view] = [plan()];
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === view.id ? { ...v, graphics: { hiddenElements: [WALL_A], hiddenLines: [`${WALL_B}|0,0,1000,0`] } } as ProjectView : v)) });
    const ui = render(<Bar />);
    assert.ok(ui.textContent?.includes('Show hidden (2)'));
    click(button(ui, 'Show all'));
    assert.equal(graphics(), undefined);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A]);
  });

  it('the ghost of a hidden element brings it back with one click, one undo step', () => {
    const view = plan();
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === view.id ? { ...v, graphics: { hiddenElements: [WALL_A, WALL_B] } } as ProjectView : v)) });
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const raw = { cutPolygons: [11, 12].map((entityId) => ({ entityId, ifcType: 'IfcWall', polygon: { outer: sq, holes: [] } })), lines: [] };
    const ghosts = hiddenGhosts(raw as never, graphicsNow(), (id) => GUIDS[id]);
    assert.deepEqual([...ghosts.elements.keys()], [WALL_A, WALL_B]);
    const ui = render(<HiddenGhostLayer ghosts={ghosts} transform={{ scale: 100, x: 0, y: 0 }} axis="down" onShowElement={(id) => showElements(view.id, [id])} onShowLine={() => {}} />);
    assert.equal(ui.querySelectorAll('[data-ghost-element]').length, 2);
    click(ui.querySelector(`[data-ghost-element="${WALL_A}"]`)!);
    assert.deepEqual(graphics()?.hiddenElements, [WALL_B], 'one click brought that element back');
    assert.equal(undoDrafts(), true);
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A, WALL_B]);
    assert.equal(undoDrafts(), false, 'one step');
  });
});

const graphicsNow = (): ViewGraphics | undefined => graphics();

describe('the drawing\'s card lists what is hidden, and what the model no longer has', () => {
  const Section = () => {
    const v = useProjectStore((s) => s.views.find((x) => x.id === plan().id)!);
    return <HiddenElementsSection view={v} />;
  };

  it('lists the hidden elements by name with Show and Show all', () => {
    const view = plan();
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === view.id ? { ...v, graphics: { hiddenElements: [WALL_A, WALL_B] } } as ProjectView : v)) });
    const ui = render(<Section />);
    assert.ok(ui.textContent?.includes('IfcWall Basement wall'));
    assert.ok(ui.textContent?.includes('IfcWall Garden wall'));
    click(button(ui, 'Show IfcWall Basement wall'));
    assert.deepEqual(graphics()?.hiddenElements, [WALL_B]);
    click(button(ui, 'Show all'));
    assert.equal(graphics(), undefined);
  });

  it('hides the selected elements from the card', () => {
    const ui = render(<Section />);
    select(11);
    click(button(ui, 'Hide the selected element'));
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A]);
  });

  it('keeps and lists elements the reloaded model no longer has, and forgets them on request', () => {
    const view = plan();
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === view.id ? { ...v, graphics: { hiddenElements: [WALL_A, GONE], elements: { [GONE]: { lineColor: '#808080', about: 'IfcDoor D1' } } } } as ProjectView : v)) });
    const ui = render(<Section />);
    assert.ok(ui.textContent?.includes('Not in the model any more'));
    assert.ok(ui.textContent?.includes('IfcDoor D1 · hidden, own graphics'));
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A, GONE], 'listed, not dropped');
    click(button(ui, 'Forget what this drawing says about IfcDoor D1'));
    assert.deepEqual(graphics(), { hiddenElements: [WALL_A] });
    assert.equal(undoDrafts(), true);
    assert.deepEqual(graphics()?.hiddenElements, [WALL_A, GONE]);
  });

  it('lists nothing as gone before any model is loaded', () => {
    useViewerStore.setState({ models: new Map() } as never);
    const view = plan();
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === view.id ? { ...v, graphics: { hiddenElements: [WALL_A] } } as ProjectView : v)) });
    const ui = render(<Section />);
    assert.ok(!ui.textContent?.includes('Not in the model any more'));
  });
});

describe('in Romanian', () => {
  it('says the bar and the card in Romanian', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    setLocale('ro');
    const ui = render(<Bar />);
    select(11);
    assert.ok(ui.textContent?.includes('Ascunde în această vedere'), ui.textContent ?? '');
    assert.ok(ui.textContent?.includes('Un element selectat'));
    assert.ok(ui.textContent?.includes('Grafica acestui element…'));
  });
});
