/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #924: a door's mark in a circle and a window's in a hexagon. The app's sheet draws them where the engine's sheet (the
 * layout the PDF, SVG and DXF of `ifcsheet build` are written from) does; the sheet's DXF carries the hexagon's six corners;
 * the labels follow their type's door and window frames; a project or a library saved before keeps its boxes.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { MARK_TYPE_ID, sheetFormat, type LabelElement, type ProjectDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic, sheetGraphicToDxf } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import type { AnnotationType } from '@/catalogue/types';
import { readAnnotationType } from '@/catalogue/readers';
import { parseCatalogue } from '@/catalogue/catalogue-file';
import { settleLabels } from '@/labels/label-sync';
import { SheetPaper } from './SheetPaper';
import { sheetDxf } from './sheet-dxf';

const drawing = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 30, y: 20 } },
  config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 1 },
  lines: [], cutPolygons: [], projectionPolygons: [],
  stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;
const view = { id: 'v', kind: 'plan', name: 'Plan', createdAt: 0, level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, scale: 50 } as unknown as ProjectView;
const vp: SheetViewport = { id: 'vp', viewId: 'v', x: 420, y: 297, scale: 50, width: 0, height: 0, center: null };
const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [vp] };
const layer: DraftLayer = { id: 'tags', name: 'Tags', color: '#000000', visible: true, locked: false };

const mark = (id: string, guid: string, text: string, p: { x: number; y: number }, frame?: string): DraftEntity => ({
  id, viewId: 'v', layerId: 'tags',
  shape: { type: 'text', p, text, height: 0.125, rotation: 0, ...(frame ? { frame } : {}) },
  params: { labelOf: guid, atype: MARK_TYPE_ID },
} as DraftEntity);

/** The corners of each closed LWPOLYLINE a DXF holds. */
function closedPolylines(dxf: string): { x: number; y: number }[][] {
  const lines = dxf.split(/\r?\n/).map((l) => l.trim());
  const out: { pts: { x: number; y: number }[]; closed: boolean }[] = [];
  let cur: { pts: { x: number; y: number }[]; closed: boolean } | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const [code, value] = [lines[i], lines[i + 1]];
    if (code === '0') {
      cur = value === 'LWPOLYLINE' ? { pts: [], closed: false } : null;
      if (cur) out.push(cur);
    } else if (cur && code === '70') cur.closed = value === '1';
    else if (cur && code === '10') cur.pts.push({ x: Number(value), y: NaN });
    else if (cur && code === '20') cur.pts[cur.pts.length - 1].y = Number(value);
  }
  return out.filter((p) => p.closed).map((p) => p.pts);
}

// happy-dom has no layout and does not map presentation attributes to computed style: the DXF walker needs a screen CTM and the stroke (as leader-end-842 does).
const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
const ownCtm = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
const realStyle = window.getComputedStyle.bind(window);

function bothSides(drafts: DraftEntity[]) {
  useProjectStore.setState({ draftLayers: [layer] });
  const ui = render(<SheetPaper sheet={sheet} projectName="Tags" content={() => ({ view, drawing, drafts })} layers={[layer]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const locale = sheetFormat('en', useProjectStore.getState().unitsAndNumbers);
  const doc = { name: 'Tags', models: [], views: [view], sheets: [sheet] } as unknown as ProjectDocument;
  const layout = sheetGraphic(sheet, doc, new Map([['v', drawing]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { north: null, locale },
    { annotations: { drafts, layers: [layer], groups: [], book: { textStyles: [], dimStyles: [] }, locale } });
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  return { ui, layout, screenDxf: () => new TextDecoder('windows-1252').decode(sheetDxf(svg, sheet)), engineDxf: new TextDecoder('windows-1252').decode(sheetGraphicToDxf(layout)) };
}

describe('a door mark in a circle and a window mark in a hexagon on the sheet (#924)', () => {
  beforeEach(() => {
    resetProject();
    proto.getScreenCTM = () => new DOMMatrix();
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const style = realStyle(el, pseudo);
      return new Proxy(style, { get: (target, key) => (key === 'stroke' || key === 'fill' ? target[key] || el.getAttribute(key) || '' : Reflect.get(target, key) instanceof Function ? Reflect.get(target, key).bind(target) : Reflect.get(target, key)) });
    }) as typeof window.getComputedStyle;
  });
  afterEach(() => {
    cleanup();
    window.getComputedStyle = realStyle;
    if (ownCtm) Object.defineProperty(proto, 'getScreenCTM', ownCtm); else delete proto.getScreenCTM;
  });

  it('the sheet rings the door\'s mark in a circle and the window\'s in a closed six-sided outline, at the engine\'s paper points', () => {
    const { ui, layout } = bothSides([mark('d', 'door', 'D01', { x: 10, y: 10 }, 'circle'), mark('w', 'window', 'W01', { x: 20, y: 10 }, 'hexagon')]);
    const circles = [...ui.querySelectorAll('ellipse')].filter((e) => e.getAttribute('rx') === e.getAttribute('ry'));
    assert.equal(circles.length, 1, 'one circle on the sheet');
    const hexagons = [...ui.querySelectorAll('polygon')].map((p) => (p.getAttribute('points') ?? '').trim().split(/\s+/));
    assert.equal(hexagons.length, 1, 'one polygon on the sheet');
    assert.equal(hexagons[0].length, 6, 'six corners');
    // The engine's layout of the same sheet (its north mark and scale bar besides): a closed run of 48 (the circle) and of 6 (the hexagon).
    const frames = (layout.strokes ?? []).filter((s) => !s.fill).map((s) => s.runs[0]).filter((r) => r.length === 49 || r.length === 7);
    assert.deepEqual(frames.map((r) => r.length), [49, 7]);
    assert.deepEqual(frames.map((r) => r[0] === r[r.length - 1] || (r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y)), [true, true], 'both closed');
    // Both draw the hexagon at the same paper points: the sheet's corners are the layout's, rounded to the micrometre.
    const screen = hexagons[0].map((xy) => xy.split(',').map(Number));
    const engine = frames[1].slice(0, -1);
    const offset = { x: screen[0][0] - engine[0].x, y: screen[0][1] - engine[0].y };
    screen.forEach(([x, y], i) => {
      assert.ok(Math.abs(x - engine[i].x - offset.x) < 2e-3 && Math.abs(y - engine[i].y - offset.y) < 2e-3, `corner ${i}: sheet (${x}, ${y}), layout (${engine[i].x}, ${engine[i].y})`);
    });
  });

  it('the sheet\'s DXF and the engine\'s write the hexagon as one closed six-corner polyline', () => {
    const { screenDxf, engineDxf } = bothSides([mark('w', 'window', 'W01', { x: 20, y: 10 }, 'hexagon')]);
    const sixes = (dxf: string) => closedPolylines(dxf).filter((p) => p.length === 6).length;
    assert.equal(sixes(engineDxf), 1);
    assert.equal(sixes(screenDxf()), 1, 'the sheet\'s DXF holds the hexagon\'s six corners, not samples along it');
  });
});

describe('labels take their type\'s door and window frames (#924)', () => {
  const element = (className: string, tag: string): LabelElement => ({ className: () => className, attribute: (n: string) => (n === 'Tag' ? tag : '') }) as unknown as LabelElement;
  const model: Record<string, LabelElement> = { door: element('IfcDoor', 'D01'), window: element('IfcWindow', 'W01') };
  const type = (classFrames?: object): AnnotationType => ({ id: MARK_TYPE_ID, name: 'Door and window mark', tool: 'label', label: { template: '{Tag}', frame: 'box', missing: 'empty', leader: 'never', ...(classFrames ? { classFrames } : {}) } });
  const drafts = [mark('d', 'door', 'D01', { x: 0, y: 0 }, 'box'), mark('w', 'window', 'W01', { x: 5, y: 0 }, 'box')];
  const framesOf = (out: DraftEntity[]) => out.map((d) => (d.shape.type === 'text' ? d.shape.frame : null));

  it('a type that rings doors and puts windows in a hexagon gives its boxed marks those frames', () => {
    assert.deepEqual(framesOf(settleLabels(drafts, [type({ IfcDoor: 'circle', IfcWindow: 'hexagon' })], (g) => model[g] ?? null, 'en')), ['circle', 'hexagon']);
  });

  it('a type that never chose leaves every mark as it was', () => {
    assert.equal(settleLabels(drafts, [type()], (g) => model[g] ?? null, 'en'), drafts);
  });
});

describe('a project or a library saved before #924 keeps its boxed marks', () => {
  const before = { id: MARK_TYPE_ID, name: 'Door and window mark', tool: 'label', label: { template: '{Mark}', frame: 'box', missing: 'empty' } };

  it('a project\'s mark type reads as a box with no door or window frame of its own', () => {
    const read = readAnnotationType(before, '/annotationTypes/0');
    assert.deepEqual(read.label, { template: '{Mark}', frame: 'box', missing: 'empty' });
  });

  it('a library\'s mark type reads as a box with no door or window frame of its own', () => {
    const { catalogue } = parseCatalogue(JSON.stringify({ format: 'bvlib', version: 1, name: 'Office', annotationTypes: [before] }));
    assert.deepEqual(catalogue.annotationTypes[0].label, { template: '{Mark}', frame: 'box', missing: 'empty' });
  });

  it('a library saved now keeps the door\'s and the window\'s frames', () => {
    const now = { ...before, label: { ...before.label, classFrames: { IfcDoor: 'circle', IfcWindow: 'hexagon' } } };
    const { catalogue } = parseCatalogue(JSON.stringify({ format: 'bvlib', version: 1, name: 'Office', annotationTypes: [now] }));
    assert.deepEqual(catalogue.annotationTypes[0].label?.classFrames, { IfcDoor: 'circle', IfcWindow: 'hexagon' });
  });
});
