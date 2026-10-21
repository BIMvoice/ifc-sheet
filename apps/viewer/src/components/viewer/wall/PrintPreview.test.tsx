/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, press, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cancelCommand, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { sheetDxf } from '../sheets/sheet-dxf.js';
import { sheetSvgText } from '../sheets/sheet-export.js';
import { useSheetContent } from '../sheets/useSheetContent.js';
import { PrintPreview } from './PrintPreview.js';
import { SheetCanvas } from './SheetCanvas.js';

/**
 * The print preview (#101). The stage is A2 landscape (594 x 420 mm): drawing
 * area x 10..584, y 10..360; title block x 404..584, y 360..410.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const section: ProjectView = { id: 'q', kind: 'plan', name: 'First', createdAt: 0, level: { name: 'First', elevation: 3, storeyGlobalIds: [] }, cutHeight: 1.2 };
const vp = (id: string, viewId: string, x: number, scale: number): SheetViewport => ({ id, viewId, x, y: 150, scale, width: 100, height: 80, center: null });
const draft = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): DraftEntity => ({ id, viewId: 's', layerId: 'l', shape: { type: 'line', a, b }, params: {} });

const sheetOf = (viewports: SheetViewport[]): ProjectSheet => ({ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports });
function load(viewports: SheetViewport[], drafts: DraftEntity[] = []): void {
  useProjectStore.setState({ views: [plan, section], sheets: [sheetOf(viewports)], drafts });
}

let closed = 0;
function Harness({ startOpen = true }: { startOpen?: boolean }) {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  const ref = useRef<SVGSVGElement>(null);
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <SheetCanvas ref={ref} sheet={sheet} sheetContent={content} chosenId={null} onChoose={() => {}} onOpen={() => {}} onNudge={() => {}} fitKey={0} />
      <button type="button" data-open onClick={() => setOpen(true)}>open</button>
      {open && ref.current ? <PrintPreview sheet={sheet} paper={ref.current} sheetContent={content} onClose={() => { closed++; setOpen(false); }} /> : null}
    </>
  );
}

/** The preview mounts once the canvas has set its ref: open it after the first render. */
function mountOpen(): HTMLElement {
  const ui = render(<Harness startOpen={false} />);
  click(ui.querySelector('[data-open]')!);
  return ui;
}

beforeEach(() => {
  resetProject();
  closed = 0;
});
afterEach(() => {
  cancelCommand();
  cleanup();
});

const dialog = () => document.querySelector<HTMLElement>('[data-print-preview]');
const barLengths = () => Object.fromEntries([...document.querySelectorAll('[data-ref-bar]')].map((g) => [g.getAttribute('data-ref-bar'), Number(g.querySelector('rect')!.getAttribute('width'))]));
const warned = () => [...document.querySelectorAll('[data-warning]')].map((r) => `${r.getAttribute('data-warning')}:${r.getAttribute('data-reason')}`);

describe('print preview reference bars', () => {
  it('draws 1 m as 10 mm at 1:100 and 20 mm at 1:50, in paper millimetres (#101)', () => {
    load([vp('a', 'p', 150, 100), vp('b', 'q', 400, 50)]);
    mountOpen();
    assert.deepEqual(barLengths(), { a: 10, b: 20 });
    // The overlay's viewBox is the paper in mm, so those widths are paper millimetres.
    assert.equal(document.querySelector('[data-preview-overlay]')!.getAttribute('viewBox'), '0 0 594 420');
  });

  it('keeps the bar length when zoomed: 100% shows paper millimetres as CSS millimetres', () => {
    load([vp('a', 'p', 150, 100)]);
    mountOpen();
    click([...document.querySelectorAll('button')].find((b) => b.textContent === '100%')!);
    const paper = document.querySelector<HTMLElement>('[data-preview-overlay]')!.parentElement!;
    assert.equal(paper.style.width, '594mm');
    assert.deepEqual(barLengths(), { a: 10 });
  });
});

describe('print preview warnings', () => {
  it('lists and highlights a drawing partly outside the frame and a draft over the title block', () => {
    load([vp('a', 'p', 150, 100), vp('b', 'q', 40, 100)], [draft('d', { x: 420, y: 370 }, { x: 500, y: 380 })]);
    mountOpen();
    assert.deepEqual(warned().sort(), ['b:frame', 'd:titleBlock']);
    const list = document.querySelector('[data-warnings]')!.textContent ?? '';
    assert.match(list, /First \(1:100\) crosses the frame/);
    assert.match(list, /Draft line overlaps the title block/);
  });

  // Review of #136: schedules, legends and road drawings were left out of the check.
  it('lists and highlights a schedule over the title block, by its name and its own box', () => {
    const sheet = sheetOf([vp('a', 'p', 150, 100), { id: 'k', viewId: 'sch', x: 494, y: 362, scale: 50, width: 60, height: 40, center: null }]);
    useProjectStore.setState({ views: [plan, section], sheets: [sheet], drafts: [], schedules: [{ id: 'sch', name: 'Door schedule', kind: 'door', createdAt: 0 }] });
    mountOpen();
    assert.deepEqual(warned(), ['k:titleBlock']);
    assert.match(document.querySelector('[data-warnings]')!.textContent ?? '', /Door schedule overlaps the title block/);
    // Its box is the viewport's (#186: the table wraps to it and is clipped to it), 60 x 40 mm here.
    const box = document.querySelector('[data-warning="k"]')!;
    assert.deepEqual([Number(box.getAttribute('width')), Number(box.getAttribute('height'))], [60, 40]);
    assert.deepEqual(Object.keys(barLengths()), ['a'], 'a schedule has no 1 m bar');
  });

  it('has no warnings on a clean sheet', () => {
    load([vp('a', 'p', 150, 100)], [draft('d', { x: 20, y: 20 }, { x: 80, y: 30 })]);
    mountOpen();
    assert.deepEqual(warned(), []);
    assert.ok(document.querySelector('[data-no-warnings]'));
  });
});

describe('print preview leaves the exports alone', () => {
  it('gives byte-identical SVG and DXF before and after the preview is opened (#101)', () => {
    load([vp('a', 'p', 150, 100), vp('b', 'q', 400, 50)]);
    const ui = render(<Harness startOpen={false} />);
    const svg = ui.querySelector<SVGSVGElement>('svg[data-sheet-id]')!;
    const sheet = useProjectStore.getState().sheets[0];
    const svgBefore = sheetSvgText(svg, sheet);
    const dxfBefore = Buffer.from(sheetDxf(svg, sheet)).toString('latin1');
    click(ui.querySelector('[data-open]')!);
    assert.ok(dialog());
    assert.ok(document.querySelector('[data-ref-bar]'), 'the preview is drawing bars');
    assert.equal(sheetSvgText(svg, sheet), svgBefore);
    assert.equal(Buffer.from(sheetDxf(svg, sheet)).toString('latin1'), dxfBefore);
    assert.equal(svg.querySelector('[data-ref-bar]'), null);
  });
});

describe('print preview as a dialog', () => {
  it('is labelled, modal, focuses inside, and Esc closes it', () => {
    load([vp('a', 'p', 150, 100)]);
    mountOpen();
    const d = dialog()!;
    assert.equal(d.tagName, 'DIALOG');
    assert.equal(d.getAttribute('aria-modal'), 'true');
    assert.match(d.getAttribute('aria-label') ?? '', /A-101 Plans/);
    assert.ok(d.contains(document.activeElement));
    press(document.activeElement!, 'Escape');
    assert.equal(closed, 1);
    assert.equal(dialog(), null);
  });

  it('keeps Tab inside the dialog', () => {
    load([vp('a', 'p', 150, 100)]);
    mountOpen();
    const d = dialog()!;
    const stops = [...d.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')];
    stops[stops.length - 1].focus();
    press(document.activeElement!, 'Tab');
    assert.equal(document.activeElement, stops[0]);
    press(document.activeElement!, 'Tab', { shiftKey: true });
    assert.equal(document.activeElement, stops[stops.length - 1]);
  });

  it('starts no drafting while LINE is active behind it: typing reaches neither the command line nor the session', () => {
    load([vp('a', 'p', 150, 100)]);
    const ui = render(<Harness startOpen={false} />);
    assert.ok(startDraftCommand('line'));
    assert.equal(useDraftingSession.getState().commandId, 'line');
    click(ui.querySelector('[data-open]')!);
    const before = JSON.stringify({ ...useDraftingSession.getState(), messages: undefined });
    for (const key of ['d', 'i', 'm', 'Enter', ' ', 'Backspace']) press(document.activeElement!, key);
    assert.equal(useDraftingSession.getState().commandId, 'line');
    assert.ok(runningCommand());
    assert.equal(JSON.stringify({ ...useDraftingSession.getState(), messages: undefined }), before);
    const input = ui.querySelector<HTMLInputElement>('input');
    assert.equal(input?.value ?? '', '');
    assert.ok(dialog()!.contains(document.activeElement));
  });
});
