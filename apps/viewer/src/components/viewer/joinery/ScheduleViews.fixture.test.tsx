/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The window schedule of AC20-FZK-Haus on a sheet, through the real pipeline
 * (parser, wasm geometry, section generator, the sheet and its DXF): each
 * card's front, plan and section are cut from the window's own mesh and leave
 * as real DXF LINE entities on SCHEDULE-SYMBOLS. Skipped without the fixture
 * (`pnpm fixtures`) or the wasm bundle (`pnpm build:wasm:fetch`).
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, waitFor } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { WallSheet } from '../wall/WallSheet';
import { sheetDxf } from '../sheets/sheet-dxf';

beforeEach(() => resetProject());
afterEach(() => cleanup());

/** The LINE entities of a DXF text on `layer`, as [x1, y1, x2, y2]. */
function dxfLines(dxf: string, layer: string): number[][] {
  const g = dxf.split(/\r?\n/);
  const out: number[][] = [];
  for (let i = 0; i + 1 < g.length; i += 2) {
    if (g[i].trim() !== '0' || g[i + 1].trim() !== 'LINE') continue;
    const v: Record<string, string> = {};
    let j = i + 2;
    for (; j + 1 < g.length && g[j].trim() !== '0'; j += 2) v[g[j].trim()] = g[j + 1].trim();
    if (v['8'] === layer) out.push([v['10'], v['20'], v['11'], v['21']].map(Number));
  }
  return out;
}

async function windowSheetDxf(waitForViews: boolean): Promise<string> {
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  const sheetId = addScheduleToSet('window', 'Windows');
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
  const ui = render(<WallSheet sheet={sheet} width={1000} />);
  const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`);
  assert.ok(svg, 'the sheet is drawn');
  const symbols = () => svg.querySelectorAll('path[data-dxf-layer="SCHEDULE-SYMBOLS"]').length;
  if (waitForViews) await waitFor(() => symbols() > 100, 'the views to be cut and drawn', 60_000);
  else await waitFor(() => symbols() > 0, 'the generated symbols');
  // happy-dom has no layout: the identity mapping (the schedule's own paper millimetres) and the strokes the attributes carry (as grid-sheet.test.tsx).
  Object.defineProperty(svg, 'getScreenCTM', { value: () => new DOMMatrix() });
  for (const el of Array.from(svg.querySelectorAll('*'))) Object.defineProperty(el, 'getScreenCTM', { value: () => new DOMMatrix() });
  const realStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = ((el: Element) => ({ stroke: el.getAttribute('stroke') ?? 'none', fill: el.getAttribute('fill') ?? '#000', fontSize: el.getAttribute('font-size') ?? '2.5', textAnchor: el.getAttribute('text-anchor') ?? 'start' })) as never;
  try { return new TextDecoder().decode(sheetDxf(svg, sheet)); } finally { globalThis.getComputedStyle = realStyle; }
}

describe('the FZK-Haus window schedule on a sheet', { skip: planModelMissing(FZK_HAUS) }, () => {
  it('exports the real front, plan and section of its windows as DXF LINE entities', async () => {
    await loadPlanModel(FZK_HAUS);
    const dxf = await windowSheetDxf(true);
    const lines = dxfLines(dxf, 'SCHEDULE-SYMBOLS');
    assert.ok(lines.length > 100, `${lines.length} LINE entities on SCHEDULE-SYMBOLS`);
    // At 1:50 the 2.00 m x 1.20 m windows are 40 x 24 mm on paper: a long horizontal line is their sill or head.
    assert.ok(lines.some(([x1, y1, x2, y2]) => Math.abs(y1 - y2) < 1e-6 && Math.abs(Math.abs(x2 - x1) - 40) < 0.1), 'a 40 mm horizontal line (a 2 m window at 1:50)');
  });

  it('says so, in the log, when a type has no body geometry, and draws the generated symbol', async () => {
    const m = await loadPlanModel(FZK_HAUS);
    void m;
    const model = useViewerStore.getState().models.get('m')!;
    useViewerStore.setState({ models: new Map([['m', { ...model, geometryResult: { ...model.geometryResult!, meshes: [] } }]]) });
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
    try {
      const dxf = await windowSheetDxf(false);
      assert.equal(dxfLines(dxf, 'SCHEDULE-SYMBOLS').length, 0, 'no view lines: the card is its plain outline');
      await waitFor(() => warned.some((w) => /draws the generated symbol/.test(w)), 'the fallback to be logged');
    } finally {
      console.warn = warn;
    }
  });
});
