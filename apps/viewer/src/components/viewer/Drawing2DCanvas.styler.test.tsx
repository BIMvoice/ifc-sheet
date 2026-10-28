/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A project view's canvas paints with the styler it is given (#34), nothing of its own: the fill, the outline and each line take
 * the colour, width and dash the styler says (the same styler the sheet pens with, `style-parity.fzk.test.tsx`), and a line the
 * styler leaves out is not drawn. The 2D context is a recording stub (happy-dom has no 2D backend), as in
 * `Drawing2DCanvas.paperTheme.test.tsx`.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { Drawing2DCanvas } from './Drawing2DCanvas.js';
import type { CanvasStyler } from './drawing/canvas-item-style.js';

installLayout();

const line = (category: 'projection' | 'cut' | 'silhouette', y: number) => ({ line: { start: { x: 0, y }, end: { x: 1, y } }, category, visibility: 'visible' as const, entityId: 72, ifcType: 'IfcWall', modelIndex: 0, depth: 0 });

const DRAWING: Drawing2D = {
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: [line('projection', 2), line('silhouette', 3), line('cut', 4)],
  cutPolygons: [{ polygon: { outer: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], holes: [] }, entityId: 72, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
};

/** Records each stroke and fill with the style set at that moment. */
function installCanvasStub(): { strokes: string[]; fills: string[]; restore: () => void } {
  const strokes: string[] = [];
  const fills: string[] = [];
  const store = new Map<string | symbol, unknown>();
  let dash: number[] = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: 800, height: 600 };
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 7 });
      if (prop === 'setLineDash') return (d: number[]) => { dash = d; };
      if (prop === 'stroke') return () => strokes.push(`${String(store.get('strokeStyle'))} ${Number(store.get('lineWidth')).toFixed(3)} [${dash.join(',')}]`);
      if (prop === 'fill') return () => fills.push(`${String(store.get('fillStyle'))} ${String(store.get('globalAlpha') ?? 1)}`);
      if (store.has(prop)) return store.get(prop);
      return () => undefined;
    },
    set(_t, prop, value) {
      store.set(prop, value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = ((kind: string) => (kind === '2d' ? ctx : null)) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return { strokes, fills, restore: () => { HTMLCanvasElement.prototype.getContext = original; } };
}

const mounted: Root[] = [];
afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount());
});

describe('Drawing2DCanvas with a project view\'s styler (#34)', () => {
  it('fills, outlines and draws each line with what the styler says, and skips what it leaves out', () => {
    const stub = installCanvasStub();
    try {
      const styler: CanvasStyler = {
        face: () => ({ fill: '#a1a1a1', opacity: 1, stroke: '#b2b2b2', weight: 0.7, dash: [3, 1.5] }),
        line: (l) => (l.category === 'silhouette' ? null : { stroke: '#c3c3c3', weight: 0.35, dash: [] }),
      };
      const root = createRoot(document.createElement('div'));
      mounted.push(root);
      // Scale 1: a paper millimetre is one screen pixel in direct mode.
      act(() => root.render(<Drawing2DCanvas drawing={DRAWING} transform={{ x: 0, y: 0, scale: 1 }} showHiddenLines styler={styler} sectionAxis="down" />));
      assert.ok(stub.fills.includes('#a1a1a1 1'), JSON.stringify(stub.fills));
      assert.ok(stub.strokes.includes('#b2b2b2 0.700 [3,1.5]'), JSON.stringify(stub.strokes));
      assert.deepEqual(stub.strokes.filter((s) => s.startsWith('#c3c3c3')), ['#c3c3c3 0.350 []'], 'the projection line; the silhouette is left out, the cut line is the outline');
    } finally {
      stub.restore();
    }
  });
});
