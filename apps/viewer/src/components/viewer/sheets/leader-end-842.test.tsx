/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842: a label whose leader ends in a dot. The app's drawing and sheet draw the dot the engine's sheet draws (the layout the
 * PDF, SVG and DXF of `ifcsheet build` are written from), at the same paper points; a label that names no end keeps its arrow;
 * and the sheet's DXF now carries the head, arrow or dot, as a solid hatch instead of dropping it.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { arrowMark, sheetFormat, type ProjectDocument } from '@bimvoice/ifcsheet';
import { sheetGraphic, sheetGraphicToDxf } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { AnnotationGraphics } from '@/components/viewer/drafting/AnnotationGraphics';
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
const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Signage', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [vp] };
const layer: DraftLayer = { id: 'signs', name: 'Signs', color: '#000000', visible: true, locked: false };

/** A parametric label of a sign, its leader from the label to the sign's edge at drawing (16, 11). */
const label = (more: object = {}): DraftEntity => ({
  id: 'l', viewId: 'v', layerId: 'signs',
  shape: { type: 'text', p: { x: 12, y: 10 }, text: 'S-01', height: 0.125, rotation: 0, leader: { x: 16, y: 11 }, ...more },
  params: { labelOf: 'g', atype: 'sign' },
} as DraftEntity);

const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
const flat = (run: readonly { x: number; y: number }[]): number[] => run.flatMap((p) => [p.x, p.y]);
const near = (a: number[], b: number[], what: string): void => {
  assert.equal(a.length, b.length, `${what}: ${a.length} numbers on the screen, ${b.length} in the layout`);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${what} [${i}]: screen ${v}, layout ${b[i]}`));
};

/** The vertex count of each SOLID HATCH boundary a DXF holds. */
function hatchSizes(dxf: string): number[] {
  const lines = dxf.split(/\r?\n/).map((l) => l.trim());
  const out: number[] = [];
  let inHatch = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] === '0') inHatch = lines[i + 1] === 'HATCH';
    else if (inHatch && lines[i] === '93') out.push(Number(lines[i + 1]));
  }
  return out;
}

// happy-dom has no layout and does not map presentation attributes to computed style: the DXF walker needs a screen CTM and the fill (as viewport-marks-parity does).
const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
const ownCtm = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
const realStyle = window.getComputedStyle.bind(window);

/** The sheet on the screen, the engine's layout of it, and the DXF each writes, for these drafts. */
function bothSides(drafts: DraftEntity[]) {
  useProjectStore.setState({ draftLayers: [layer] });
  const ui = render(<SheetPaper sheet={sheet} projectName="Signs" content={() => ({ view, drawing, drafts })} layers={[layer]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
  const locale = sheetFormat('en', useProjectStore.getState().unitsAndNumbers);
  const doc = { name: 'Signs', models: [], views: [view], sheets: [sheet] } as unknown as ProjectDocument;
  const layout = sheetGraphic(sheet, doc, new Map([['v', drawing]]), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { north: null, locale },
    { annotations: { drafts, layers: [layer], groups: [], book: { textStyles: [], dimStyles: [] }, locale } });
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  const heads = [...ui.querySelectorAll('path[data-dxf-fill="solid"]')].map((p) => p.getAttribute('d') ?? '');
  return {
    heads,
    filled: (layout.strokes ?? []).filter((s) => s.fill).flatMap((s) => s.runs),
    screenDxf: new TextDecoder('windows-1252').decode(sheetDxf(svg, sheet)),
    engineDxf: new TextDecoder('windows-1252').decode(sheetGraphicToDxf(layout)),
  };
}

describe('a label\'s leader end on the sheet: the app and the engine agree (#842)', () => {
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

  it('a dot end: the sheet fills the engine\'s 12-sided dot at the same paper points', () => {
    const { heads, filled } = bothSides([label({ leaderEnd: 'dot' })]);
    assert.equal(heads.length, 1, 'one head on the sheet');
    assert.equal(filled.length, 1, 'one head in the layout');
    assert.equal(filled[0].length, 13, 'the layout\'s dot is a closed ring of 12 sides');
    near(numbers(heads[0]), flat(filled[0].slice(0, -1)), 'the dot');
  });

  it('no end named: the sheet draws the arrow as before, the engine\'s arrow mark, at the same paper points', () => {
    const { heads, filled } = bothSides([label()]);
    assert.equal(heads.length, 1);
    assert.equal(filled[0].length, 4, 'a closed triangle');
    near(numbers(heads[0]), flat(filled[0].slice(0, -1)), 'the arrow');
    // What the sheet drew before #842, from the same tip and direction: `M tip L back L back Z`.
    const [tip, b1, b2] = filled[0];
    const before = arrowMark('arrow', tip, { x: tip.x - (b1.x + b2.x) / 2, y: tip.y - (b1.y + b2.y) / 2 }, Math.hypot(tip.x - b1.x, tip.y - b1.y));
    assert.ok(before && before.kind === 'run');
    near(numbers(heads[0]), flat(before.pts), 'the arrow before');
  });

  it('no end: no head on either', () => {
    const { heads, filled } = bothSides([label({ leaderEnd: 'none' })]);
    assert.deepEqual(heads, []);
    assert.deepEqual(filled, []);
  });

  it('the sheet\'s DXF writes the head as a solid hatch, as the engine\'s DXF does: the arrow and the dot', () => {
    const arrow = bothSides([label()]);
    assert.deepEqual(hatchSizes(arrow.screenDxf), [3], 'the arrow: a triangle');
    assert.deepEqual(hatchSizes(arrow.engineDxf), [3]);
    cleanup();
    const dot = bothSides([label({ leaderEnd: 'dot' })]);
    assert.deepEqual(hatchSizes(dot.screenDxf), [12], 'the dot: a ring of 12');
    assert.deepEqual(hatchSizes(dot.engineDxf), [12]);
  });
});

describe('a leader\'s end in the drafting view (#842)', () => {
  afterEach(() => cleanup());
  const transform = { x: 100, y: 100, scale: 20 };
  const draw = (shape: object) => render(<svg><AnnotationGraphics shape={shape as never} color="#000" selected={false} transform={transform} axis="down" extraPatterns={[]} /></svg>);

  it('a leader with the dot end draws a filled dot round its tip; one without draws the arrow', () => {
    const leader = { type: 'leader', pts: [{ x: 3, y: 0 }, { x: 1, y: 1 }], text: 'S-01', height: 0.25 };
    const dot = numbers(draw({ ...leader, leaderEnd: 'dot' }).querySelector('path[data-dxf-fill]')?.getAttribute('d') ?? '');
    assert.equal(dot.length, 24, 'twelve vertices');
    const xs = dot.filter((_, i) => i % 2 === 0), ys = dot.filter((_, i) => i % 2 === 1);
    const c = { x: xs.reduce((a, b) => a + b) / 12, y: ys.reduce((a, b) => a + b) / 12 };
    const r = xs.map((x, i) => Math.hypot(x - c.x, ys[i] - c.y));
    assert.ok(Math.max(...r) - Math.min(...r) < 1e-9, 'round');
    cleanup();
    const arrow = numbers(draw(leader).querySelector('path[data-dxf-fill]')?.getAttribute('d') ?? '');
    assert.equal(arrow.length, 6, 'a triangle');
    assert.ok(Math.abs(arrow[0] - c.x) < 1e-9 && Math.abs(arrow[1] - c.y) < 1e-9, 'the arrow\'s point is where the dot is centred: the tip');
  });
});
