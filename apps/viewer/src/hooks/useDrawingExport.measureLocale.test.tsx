/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The measure labels an exported drawing carries are written in the active
 * language (#269): "3,500 m" and "12,50 m²" in Romanian, "3.500 m" and
 * "12.50 m²" in English. The SVG path coordinates beside them stay plain.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GraphicOverrideEngine, type Drawing2D } from '@ifc-lite/drawing-2d';
import { registerLocale, setLocale } from '@/i18n';
import { useViewerStore } from '@/store';
import useDrawingExport from './useDrawingExport.js';

function emptyDrawing(): Drawing2D {
  return {
    config: { plane: { axis: 'z', position: 0, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 50 },
    lines: [], cutPolygons: [], projectionPolygons: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 4 } },
    stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
  };
}

// Held outside the component so a re-render hands the hook the same props: only the language can change what it writes.
const DRAWING = emptyDrawing();
const ENGINE = new GraphicOverrideEngine([]);
const COLORS = new Map<number, [number, number, number, number]>();
const MEASURES = [{ id: 'm', start: { x: 0, y: 0 }, end: { x: 3.5, y: 0 }, distance: 3.5 }];
const AREAS = [{ id: 'p', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2.5 }, { x: 0, y: 2.5 }], area: 12.5, perimeter: 15 }];
const OPTIONS = { showHiddenLines: true, scale: 50, showScanSection: false, scanSectionOpacity: 0, scanSectionIncludeInExport: false };
const PLANE = { axis: 'down' as const, position: 0, flipped: false };
const NO_ANNOTATIONS: never[] = [];
const NO_UNDERLAYS: never[] = [];
const SCAN = { points: [] };

function Harness({ onReady }: { onReady: (fn: () => void) => void }): null {
  const { handleExportSVG } = useDrawingExport({
    drawing: DRAWING,
    displayOptions: OPTIONS,
    sectionPlane: PLANE,
    activePresetId: null,
    entityColorMap: COLORS,
    overridesEnabled: false,
    overrideEngine: ENGINE,
    measure2DResults: MEASURES,
    polygonArea2DResults: AREAS,
    textAnnotations2D: NO_ANNOTATIONS,
    cloudAnnotations2D: NO_ANNOTATIONS,
    sheetEnabled: false,
    activeSheet: null,
    dxfUnderlays: NO_UNDERLAYS,
    ifcDataStore: null,
    coordinateInfo: undefined,
    scanSection: SCAN,
  });
  onReady(handleExportSVG);
  return null;
}

/** Runs the real `handleExportSVG` and returns the SVG text it produced. */
async function exportSvg(switchTo?: string): Promise<string> {
  useViewerStore.setState({ models: new Map() });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  let exportFn: (() => void) | null = null;
  const originalCreate = URL.createObjectURL;
  let resolveSvg!: (blob: Blob) => void;
  const svgBlob = new Promise<Blob>((resolve) => { resolveSvg = resolve; });
  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    if (obj instanceof Blob && obj.type === 'image/svg+xml') resolveSvg(obj);
    return originalCreate.call(URL, obj);
  };
  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<Harness onReady={(fn) => { exportFn = fn; }} />);
    });
    // A language switch after the page is up: the export it hands out afterwards writes the new language.
    if (switchTo) await act(async () => { setLocale(switchTo); });
    let blob: Blob | null = null;
    await act(async () => { exportFn!(); blob = await svgBlob; });
    return await (blob as unknown as Blob).text();
  } finally {
    URL.createObjectURL = originalCreate;
    if (root) await act(async () => { (root as Root).unmount(); });
    container.remove();
  }
}

const labels = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe('useDrawingExport SVG writer: measure labels follow the language (#269)', () => {
  afterEach(() => setLocale('en'));

  it('writes the distance and the area with a comma in Romanian', async () => {
    registerLocale('ro', {});
    setLocale('ro');
    assert.deepEqual(labels(await exportSvg()), ['3,500 m', '12,50 m²']);
  });

  it('writes them with a point in English, and the path coordinates stay plain in both', async () => {
    setLocale('en');
    const svg = await exportSvg();
    assert.deepEqual(labels(svg), ['3.500 m', '12.50 m²']);
    assert.match(svg, /<line x1="0\.0000" y1="0\.0000" x2="3\.5000"/);
    registerLocale('ro', {});
    setLocale('ro');
    assert.match(await exportSvg(), /<line x1="0\.0000" y1="0\.0000" x2="3\.5000"/);
  });

  it('writes the new language after a switch with nothing else changed', async () => {
    registerLocale('ro', {});
    setLocale('en');
    assert.deepEqual(labels(await exportSvg('ro')), ['3,500 m', '12,50 m²']);
  });
});
