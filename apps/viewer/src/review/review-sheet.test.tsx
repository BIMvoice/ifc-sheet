/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render, type as typeInto } from '@/test/render.js';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetCanvas } from '@/components/viewer/wall/SheetCanvas.js';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { useSheetContent } from '@/components/viewer/sheets/useSheetContent.js';
import { addComment } from './actions';
import { setHighlight, setPlacing, useReviewUi } from './ui-store';

/**
 * Pins are for the screen. The exports read the paper (`svg[data-sheet-id]`)
 * and a pin lives beside it, so the SVG and the DXF of a sheet are the same
 * bytes with comments on it or not (#55). Typing a comment is typing in a
 * field, not at the drawing tool underneath.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
const K = 776 / 420;
const X0 = (1280 - 594 * K) / 2;
const Y0 = 12;
const at = (mm: { x: number; y: number }) => ({ clientX: X0 + mm.x * K, clientY: Y0 + mm.y * K });

function Harness() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  return <SheetCanvas sheet={sheet} sheetContent={content} chosenId={null} onChoose={() => {}} onOpen={() => {}} onNudge={() => {}} fitKey={0} />;
}

beforeEach(() => {
  resetProject();
  useReviewUi.setState({ placing: false, highlight: null });
  useProjectStore.setState({ views: [plan], sheets: [{ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] }] });
});
afterEach(() => cleanup());

const paperOf = (ui: HTMLElement) => {
  const svg = ui.querySelector<SVGSVGElement>('svg[data-sheet-id]');
  assert.ok(svg);
  return svg;
};
const sheetOf = (): ProjectSheet => useProjectStore.getState().sheets[0];
const pointer = (el: Element, type: string, p: { clientX: number; clientY: number }) =>
  act(() => { el.dispatchEvent(new window.PointerEvent(type, { ...p, bubbles: true, button: 0, pointerId: 1 })); });

describe('comments never reach the exported paper', () => {
  it('leaves the sheet SVG and DXF byte-identical with and without comments, open or done, lit or not', () => {
    const ui = render(<Harness />);
    const svg = sheetSvgText(paperOf(ui), sheetOf());
    const dxf = Buffer.from(sheetDxf(paperOf(ui), sheetOf())).toString('latin1');
    let a = '';
    let b = '';
    act(() => {
      a = addComment({ sheetId: 's', x: 150, y: 150, author: 'Ana', text: 'Pe plan' });
      b = addComment({ sheetId: 's', x: 300, y: 200, author: 'Ana', text: 'Pe hârtie', elementGuid: '2O2Fr$t4X7Zf8NOew3FLOH' });
    });
    act(() => { useProjectStore.setState({ comments: useProjectStore.getState().comments?.map((c) => (c.id === b ? { ...c, status: 'done' as const } : c)) }); setHighlight(a); });
    assert.equal(ui.querySelectorAll('button[data-comment-pin]').length, 2, 'the pins are on screen');
    assert.ok(ui.textContent?.includes('Pe plan'), 'and the open conversation is');
    assert.ok(paperOf(ui).querySelector('[data-comment-pin]') === null, 'none is inside the paper');
    // A bare boolean: a diff of two whole sheets would be megabytes of failure message.
    assert.ok(sheetSvgText(paperOf(ui), sheetOf()) === svg, 'the sheet SVG changed when comments were added');
    assert.ok(Buffer.from(sheetDxf(paperOf(ui), sheetOf())).toString('latin1') === dxf, 'the sheet DXF changed when comments were added');
    assert.ok(!svg.includes('Pe plan') && !dxf.includes('Pe plan'));
  });
});

describe('typing a comment', () => {
  it('pins at the click and saves on Enter, with the LINE tool active, without starting a drawing command', () => {
    const ui = render(<Harness />);
    act(() => { startDraftCommand('line'); });
    const running = useDraftingSession.getState().commandId;
    assert.equal(running, 'line');
    act(() => setPlacing(true));
    pointer(ui.querySelector('[data-comment-capture]')!, 'pointerdown', at({ x: 200, y: 120 }));
    const box = ui.querySelector<HTMLInputElement>('input[aria-label="Comment"]');
    assert.ok(box, 'the comment box opened at the click');
    box.focus();
    // Letters that would each begin a drawing command or fill the command line, and Enter that would confirm one.
    for (const key of ['c', 'i', 'r', 'l', 'e', ' ', 'Delete', 'Backspace', 'z']) press(box, key);
    assert.equal(useDraftingSession.getState().commandId, running, 'LINE is still the running command');
    const commandLine = ui.querySelector<HTMLInputElement>('input[aria-label="Command line"]');
    assert.equal(commandLine?.value ?? '', '', 'nothing reached the command line');
    typeInto(box, 'Dimensiune lipsă');
    press(box, 'Enter');
    const saved = useProjectStore.getState().comments ?? [];
    assert.equal(saved.length, 1);
    assert.equal(saved[0].text, 'Dimensiune lipsă');
    assert.ok(Math.abs(saved[0].x - 200) < 1e-6 && Math.abs(saved[0].y - 120) < 1e-6, `${saved[0].x}, ${saved[0].y}`);
    assert.equal(saved[0].sheetId, 's');
    assert.equal(useReviewUi.getState().placing, false);
    assert.equal(useReviewUi.getState().highlight, saved[0].id);
    assert.equal(useDraftingSession.getState().commandId, running, 'and LINE is still running after the save');
  });
});
