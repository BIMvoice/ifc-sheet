/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #649: in IfcSheet's face the drawing is `bare` (no toolbar, no properties
 * panel). A selected line must still offer colour, weight and dash, its
 * layer, and a labelled button that opens the layers and line types editors.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { closeStandards } from '@/project/standards-dialog-store';
import { undoLatest } from '@/project/unified-undo';
import { addLineType } from '@/project/drafting-standards';
import type { EntityShape } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { ToolRail } from '../wall/ToolRail.js';
import { DraftingStandardsDialog } from './standards/DraftingStandardsDialog.js';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const LINE: EntityShape = { type: 'line', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const CIRCLE: EntityShape = { type: 'circle', c: { x: 2, y: 2 }, r: 1 };

function seed(shapes: EntityShape[]): string[] {
  const ids = editDrafts({ add: shapes.map((s) => newDraft('p', '0', s)) });
  clearDraftHistory();
  return ids;
}
const select = (ids: string[]) => act(() => useDraftingSession.setState({ selection: new Set(ids) }));
const entity = (id: string) => useProjectStore.getState().drafts.find((d) => d.id === id)!;
/** A real change event on a select, through the prototype setter so React notices. */
function choose(el: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  act(() => { setter.call(el, value); el.dispatchEvent(new window.Event('change', { bubbles: true })); });
}
const byLabel = <T extends Element>(root: ParentNode, tag: string, label: string): T => {
  const el = [...root.querySelectorAll<T>(`${tag}[aria-label="${label}"]`)][0];
  assert.ok(el, `${tag} "${label}" is on the page`);
  return el;
};
/** The stroke the drawing paints for the drafted line: unselected, so not the selection blue. */
function paintedPens(): Array<{ stroke: string | null; dash: string | null }> {
  return [...document.querySelectorAll('path[fill="none"]')]
    .filter((p) => p.getAttribute('stroke') !== '#2563eb' && p.getAttribute('stroke') !== '#f59e0b')
    .map((p) => ({ stroke: p.getAttribute('stroke'), dash: p.getAttribute('stroke-dasharray') }));
}

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  closeStandards();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  closeStandards();
  cleanup();
  cancelCommand();
});

describe('a selected drawn line in the bare drawing (#649)', () => {
  it('turns red, heavy and dashed from the card, and the stored pen and the painted stroke follow; undo restores the colour', () => {
    const [id] = seed([LINE]);
    render(<DraftingView view={plan} bare />);
    select([id]);
    const before = entity(id).params['o.color'];
    type(byLabel(document, 'input', 'Colour'), '#ff0000');
    assert.equal(entity(id).params['o.color'], '#ff0000');
    choose(byLabel(document, 'select', 'Weight (mm)'), '0.7');
    assert.equal(entity(id).params['o.lineWeight'], 0.7);
    choose(byLabel(document, 'select', 'Line type'), 'dashed');
    assert.equal(entity(id).params['o.lineType'], 'dashed');
    select([]);
    const pens = paintedPens();
    assert.ok(pens.some((p) => p.stroke === '#ff0000' && p.dash !== null), `a red dashed stroke is painted: ${JSON.stringify(pens)}`);
    select([id]);
    act(() => undoLatest());
    act(() => undoLatest());
    act(() => undoLatest());
    assert.equal(entity(id).params['o.color'], before, 'undo restores the colour');
  });

  it('applies to every element of a multi-selection', () => {
    const [a, b] = seed([LINE, CIRCLE]);
    render(<DraftingView view={plan} bare />);
    select([a, b]);
    type(byLabel(document, 'input', 'Colour'), '#ff0000');
    assert.equal(entity(a).params['o.color'], '#ff0000');
    assert.equal(entity(b).params['o.color'], '#ff0000');
  });

  it('shows the layer and moves the selection to another layer', () => {
    const [id] = seed([LINE]);
    useProjectStore.setState({ draftLayers: [...useProjectStore.getState().draftLayers, { id: 'red', name: 'Red work', color: '#ff0000', lineWeight: 0.25, lineType: 'continuous' } as never] });
    render(<DraftingView view={plan} bare />);
    select([id]);
    choose(byLabel(document, 'select', 'Layer'), 'red');
    assert.equal(entity(id).layerId, 'red');
  });

  it('opens the layers and line types editors from a labelled button, and a line type changed there redraws the line', () => {
    const [id] = seed([LINE]);
    const typeId = addLineType('Long dash', [6, 2]);
    render(<><DraftingView view={plan} bare /><DraftingStandardsDialog /></>);
    select([id]);
    assert.equal(document.querySelector('[role="dialog"]'), null, 'closed to begin with');
    const open = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Layers and line types');
    assert.ok(open, 'a button with a text label opens the editors');
    click(open);
    assert.ok(document.querySelector('[role="dialog"]'), 'the dialog is in the document');
    assert.ok(document.querySelector('section[aria-label="Line types"]') ?? document.body.textContent?.includes('Long dash'), 'the line types editor is in the dialog');
    // The line takes that line type, then the editor changes its pattern.
    act(() => useDraftingSession.setState({ selection: new Set([id]) }));
    choose(byLabel(document, 'select', 'Line type'), typeId);
    assert.equal(entity(id).params['o.lineType'], typeId);
    select([]);
    const dashBefore = paintedPens().find((p) => p.dash !== null)?.dash;
    assert.ok(dashBefore, 'the custom dash is painted');
    const pattern = byLabel<HTMLInputElement>(document, 'input', 'Long dash · Pattern (mm)');
    type(pattern, '1 1');
    act(() => pattern.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
    const dashAfter = paintedPens().find((p) => p.dash !== null)?.dash;
    assert.notEqual(dashAfter, dashBefore, 'the line follows the editor');
  });

  it('offers the current layer and the editors on the left drawing tools, with nothing selected', () => {
    const ui = render(<><ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} /><DraftingStandardsDialog /></>);
    byLabel(ui, 'select', 'Current layer');
    const open = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Layers and line types');
    assert.ok(open, 'a labelled button on the rail');
    click(open);
    assert.ok(document.querySelector('[role="dialog"]'));
  });
});
