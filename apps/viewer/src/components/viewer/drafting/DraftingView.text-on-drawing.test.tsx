/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168 in the real drafting view: the words of a Text or a Note are typed in
 * the editor that opens on the drawing where they print, not in the command
 * strip. A straight Note needs no Enter (a second click on the bend, or "No
 * bend"), and Done keeps a Note's leader instead of throwing it away. AutoCAD
 * mode keeps the typed strip.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, press, render, type as typeInto } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store';
import { undoLatest } from '@/project/unified-undo';
import { cancelCommand, clickDrawing, currentLayerId, endCommand, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import type { ProjectView } from '@/project/types';
import { drawingToScreen } from '@/drafting/frame';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const click = (x: number, y: number) => act(() => clickDrawing({ x, y }, 0.05, false));
const drafts = () => useProjectStore.getState().drafts;
const editorIn = (ui: HTMLElement) => ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="New text"]');
const noBend = (ui: HTMLElement) => [...ui.querySelectorAll('button')].find((b) => b.textContent === 'No bend');

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
});

describe('Text is written on the drawing where it prints', () => {
  it('the click opens the editor there; "WC" and Enter make one text at the click point, and one undo removes it', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('text'); });
    assert.equal(editorIn(ui), null, 'no editor before the point is placed');
    click(2, 3);
    await advance(0);
    const box = editorIn(ui);
    assert.ok(box, 'the on-drawing editor is open after the click');
    assert.equal(document.activeElement, box, 'it has the keyboard');
    typeInto(box, 'WC');
    press(box, 'Enter');
    assert.equal(drafts().length, 1);
    const [text] = drafts();
    assert.equal(text.shape.type, 'text');
    if (text.shape.type !== 'text') return;
    assert.equal(text.shape.text, 'WC');
    assert.deepEqual(text.shape.p, { x: 2, y: 3 });
    assert.equal(text.layerId, currentLayerId());
    assert.equal(editorIn(ui), null, 'the editor closes');
    assert.equal(runningCommand(), null);
    act(() => { undoLatest(); });
    assert.equal(drafts().length, 0, 'one undo step');
  });

  it('a press away from the editor commits what is typed, and Esc cancels', () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('text'); });
    click(1, 1);
    typeInto(editorIn(ui)!, 'Hall');
    act(() => { ui.querySelector('[data-drafting-canvas]')!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true })); });
    assert.deepEqual(drafts().map((d) => (d.shape.type === 'text' ? d.shape.text : '')), ['Hall']);

    act(() => { startDraftCommand('text'); });
    click(5, 5);
    typeInto(editorIn(ui)!, 'Gone');
    press(editorIn(ui)!, 'Escape');
    assert.equal(drafts().length, 1, 'Esc drafts nothing');
    assert.equal(runningCommand(), null);
    assert.equal(editorIn(ui), null);
  });
});

describe('Note: a straight leader needs no Enter', () => {
  it('a second click on the bend makes a one-segment leader, and its text is typed on the drawing', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(2, 1);
    await advance(0);
    const box = editorIn(ui);
    assert.ok(box, 'the editor opens at the end of the leader');
    typeInto(box, 'Steel post');
    press(box, 'Enter');
    assert.equal(drafts().length, 1);
    const [leader] = drafts();
    assert.equal(leader.shape.type, 'leader');
    if (leader.shape.type !== 'leader') return;
    assert.deepEqual(leader.shape.pts, [{ x: 0, y: 0 }, { x: 2, y: 1 }]);
    assert.equal(leader.shape.text, 'Steel post');
  });

  it('"No bend" by the bend does the same', () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    assert.equal(noBend(ui), undefined, 'nothing to end at yet');
    click(2, 1);
    const button = noBend(ui);
    assert.ok(button, 'offered once the bend is placed');
    act(() => button.click());
    typeInto(editorIn(ui)!, 'A');
    press(editorIn(ui)!, 'Enter');
    const shape = drafts()[0]?.shape;
    assert.equal(shape?.type === 'leader' ? shape.pts.length : 0, 2);
  });

  it('Done after the bend keeps the leader', () => {
    render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    act(() => endCommand());
    assert.equal(runningCommand(), null);
    assert.equal(drafts().length, 1, 'Done finished the leader instead of cancelling it');
    const shape = drafts()[0].shape;
    assert.deepEqual(shape.type === 'leader' ? shape.pts : null, [{ x: 0, y: 0 }, { x: 2, y: 1 }]);
  });

  it('Done while its words are asked for keeps the two-segment leader', () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(5, 1);
    assert.ok(editorIn(ui));
    act(() => endCommand());
    assert.equal(drafts().length, 1);
    const shape = drafts()[0].shape;
    assert.equal(shape.type === 'leader' ? shape.pts.length : 0, 3);
  });
});

describe('Note: the leader stays drawn while its words are asked for (#168)', () => {
  /** The blue dashed preview paths of the running command, as the drawing overlay draws them. */
  const previews = (ui: HTMLElement) => [...ui.querySelectorAll('path[stroke-dasharray="4 3"]')].map((p) => p.getAttribute('d') ?? '');
  const hover = (ui: HTMLElement, x: number, y: number) => {
    const s = drawingToScreen({ x, y }, { scale: 40, x: 0, y: 0 }, 'down');
    act(() => { ui.querySelector('[data-drafting-canvas]')!.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: s.x, clientY: s.y })); });
  };

  it('a one-segment leader is previewed with the editor open', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(2, 1);
    hover(ui, 6, 6);
    await advance(0);
    assert.ok(editorIn(ui), 'the editor is open');
    const shown = previews(ui);
    assert.equal(shown.length, 1, 'the leader is drawn as a preview');
    const segments = shown[0].match(/[ML]/g) ?? [];
    assert.equal(segments.length, 2, 'arrow point and end: one segment');
  });

  it('a two-segment leader is previewed with the editor open', async () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(5, 1);
    hover(ui, 6, 6);
    await advance(0);
    assert.ok(editorIn(ui), 'the editor is open');
    const shown = previews(ui);
    assert.equal(shown.length, 1, 'the leader is drawn as a preview');
    assert.equal((shown[0].match(/[ML]/g) ?? []).length, 3, 'arrow point, bend and end: two segments');
  });

  it('Esc drafts nothing and the preview goes', () => {
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    click(5, 1);
    hover(ui, 6, 6);
    press(editorIn(ui)!, 'Escape');
    assert.equal(drafts().length, 0);
    assert.equal(previews(ui).length, 0);
  });
});

describe('AutoCAD mode keeps the typed strip', () => {
  it('opens no editor on the drawing, and the command line takes the text', () => {
    setAutocadMode(true);
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('text'); });
    click(2, 3);
    assert.equal(editorIn(ui), null);
    assert.equal(useDraftingSession.getState().prompt?.key, 'textLines.prompt');
    const line = ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="Command line"]')!;
    typeInto(line, 'WC');
    press(line, 'Enter');
    const shape = drafts()[0]?.shape;
    assert.equal(shape?.type === 'text' ? shape.text : null, 'WC');
  });

  it('a Note still asks for its end with Enter for a one-segment leader, typed in the strip', () => {
    setAutocadMode(true);
    const ui = render(<DraftingView view={plan} />);
    act(() => { startDraftCommand('leader'); });
    click(0, 0);
    click(2, 1);
    assert.equal(noBend(ui), undefined, 'no button: Enter does it');
    const line = ui.querySelector<HTMLTextAreaElement>('textarea[aria-label="Command line"]')!;
    press(line, 'Enter');
    typeInto(line, 'Post');
    press(line, 'Enter');
    const shape = drafts()[0]?.shape;
    assert.equal(shape?.type === 'leader' ? `${shape.pts.length} ${shape.text}` : null, '2 Post');
  });
});
