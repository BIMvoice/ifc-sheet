/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Phases on a real model (#93): the FZK-Haus with `Pset_WallCommon.Status` set on five
 * ground-floor walls (one to demolish, one new, three existing; a sixth wall has no
 * Status). The plan is drawn by the real drawing generator over the model's real
 * meshes; the demolition and proposed plans are the same drawing through the view's
 * phases, then through the sheet's pens, the sheet SVG and the DXF.
 */

import '@/test/setup-dom.js';
import { before, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { loadPhaseModel, WALL, type PhaseModel } from '@/test/phase-fixture.js';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper.js';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export.js';
import { viewportPens, type Pen } from '@/components/viewer/sheets/viewport-pens.js';
import { svgToDxf } from '@/components/viewer/sheets/sheet-dxf.js';
import { phaseOfRenderId, phaseViewOf } from './phase-view.js';
import { PHASE_VIEW_PRESETS } from './phases.js';
import { styledDrawing, type StyledDrawing } from './view-graphics.js';
import type { ProjectSheet, ProjectView, ViewGraphics } from './types.js';

const DEMOLITION: ViewGraphics = { phases: { show: [...PHASE_VIEW_PRESETS.demolition] } };
const PROPOSED: ViewGraphics = { phases: { show: [...PHASE_VIEW_PRESETS.proposed] } };

let model: PhaseModel;
let plan: Drawing2D;
before(async () => {
  model = await loadPhaseModel();
  plan = await model.draw('plan');
});
afterEach(() => cleanup());

const styled = (d: Drawing2D, graphics: ViewGraphics | undefined): StyledDrawing => styledDrawing(d, graphics, undefined, undefined, undefined, phaseViewOf(graphics, undefined));
const entities = (d: Drawing2D): Set<number> => new Set([...d.lines.map((l) => l.entityId), ...d.cutPolygons.map((p) => p.entityId)]);
/** The drawing reduced to one element: what that element is drawn with, and nothing else. */
const only = (d: StyledDrawing, id: number): StyledDrawing => ({ ...d, lines: d.lines.filter((l) => l.entityId === id), cutPolygons: d.cutPolygons.filter((p) => p.entityId === id) });
const pens = (d: StyledDrawing, graphics: ViewGraphics | undefined): Pen[] => viewportPens(d, graphics, { scale: 1000, x: 0, y: 0 }, 'down', []);
const outline = (list: Pen[]): Pen[] => list.filter((p) => p.layer === 'CUT');

describe('phase of the fixture walls, read from the model', () => {
  it('reads the Status set on each wall, the default where there is none', () => {
    assert.deepEqual(WALL.existing.map((id) => phaseOfRenderId(id, undefined)), ['existing', 'existing', 'existing']);
    assert.equal(phaseOfRenderId(WALL.demolish, undefined), 'demolish');
    assert.equal(phaseOfRenderId(WALL.new, undefined), 'new');
    assert.equal(phaseOfRenderId(WALL.none, undefined), 'existing', 'no Status counts as existing');
    assert.equal(phaseOfRenderId(WALL.none, { unmarked: 'new' }), 'new', 'unless the project says otherwise');
    assert.equal(phaseOfRenderId(999999999, undefined), null, 'not an element of the model');
  });

  it('the sample drew all six walls', () => {
    const drawn = entities(plan);
    for (const id of [...WALL.existing, WALL.demolish, WALL.new, WALL.none]) assert.ok(drawn.has(id), `wall ${id} is in the plan`);
  });
});

describe('the demolition plan', () => {
  it('draws the existing walls grey, the demolished wall dashed, and not the new wall', () => {
    const d = styled(plan, DEMOLITION);
    assert.ok(!entities(d).has(WALL.new), 'the new wall is not drawn');
    for (const id of [...WALL.existing, WALL.none]) {
      const cut = outline(pens(only(d, id), DEMOLITION));
      assert.ok(cut.length > 0, `existing wall ${id} has an outline`);
      assert.ok(cut.every((p) => p.stroke === '#808080' && !p.dash && p.width === 0.25), `existing wall ${id}: thin grey, continuous`);
    }
    const cut = outline(pens(only(d, WALL.demolish), DEMOLITION));
    assert.ok(cut.length > 0, 'the demolished wall has an outline');
    assert.ok(cut.every((p) => p.stroke === '#000000' && p.dash === '3 1.5' && p.width === 0.5), 'the demolished wall: dashed');
  });

  it('puts the dashes on the sheet and in the DXF, on the demolished wall only', () => {
    const wall = (graphics: ViewGraphics, id: number) => sheetOf(only(styled(plan, graphics), id), graphics);
    const demolished = wall(DEMOLITION, WALL.demolish);
    assert.match(demolished.svg, /data-dxf-ltype="dashed"[^>]*stroke-dasharray="3 1.5"|stroke-dasharray="3 1.5"/);
    const dashed = dxfEntities(demolished.dxf).filter((e) => e.layer === 'CUT');
    assert.ok(dashed.length > 0 && dashed.every((e) => e.lineType === 'DASHED'), 'the demolished wall\'s DXF lines are dashed');
    const existing = dxfEntities(wall(DEMOLITION, WALL.existing[0]).dxf).filter((e) => e.layer === 'CUT');
    assert.ok(existing.length > 0 && existing.every((e) => e.lineType === 'Continuous'), 'an existing wall exports continuous');
    // The whole demolition plan: the layer holds dashed and continuous lines, and the dashed ones
    // are exactly the demolished wall's, each carrying its own line type.
    const whole = dxfEntities(sheetOf(styled(plan, DEMOLITION), DEMOLITION).dxf).filter((e) => e.layer === 'CUT');
    assert.equal(whole.filter((e) => e.lineType === 'DASHED').length, dashed.length);
    assert.ok(whole.some((e) => e.lineType === 'Continuous'));
  });
});

describe('the proposed plan', () => {
  it('draws the existing walls and the new wall heavy, and not the demolished wall', () => {
    const d = styled(plan, PROPOSED);
    assert.ok(!entities(d).has(WALL.demolish), 'the demolished wall is not drawn');
    for (const id of WALL.existing) assert.ok(outline(pens(only(d, id), PROPOSED)).every((p) => p.stroke === '#808080' && p.width === 0.25), `existing wall ${id} stays thin grey`);
    const cut = outline(pens(only(d, WALL.new), PROPOSED));
    assert.ok(cut.length > 0, 'the new wall has an outline');
    assert.ok(cut.every((p) => p.stroke === '#000000' && !p.dash && p.width === 0.7), 'the new wall: heavy black, continuous');
  });

  it('has no dashed outline on the sheet at all', () => {
    const sheet = sheetOf(styled(plan, PROPOSED), PROPOSED);
    assert.doesNotMatch(sheet.svg, /stroke-dasharray="3 1.5"/);
    assert.ok(dxfEntities(sheet.dxf).filter((e) => e.layer === 'CUT').every((e) => e.lineType === 'Continuous'));
    assert.match(sheet.svg, /stroke-width="0.7"/);
  });
});

describe('a view\'s own phase styles', () => {
  it('colour sets: the view changes the demolished wall to yellow and the new wall to red', () => {
    const graphics: ViewGraphics = { phases: { show: ['existing', 'demolish', 'new'], styles: { demolish: { lineColor: '#e6b800' }, new: { lineColor: '#cc0000' } } } };
    const d = styled(plan, graphics);
    assert.ok(outline(pens(only(d, WALL.demolish), graphics)).every((p) => p.stroke === '#e6b800' && p.dash === '3 1.5'), 'yellow, still dashed');
    assert.ok(outline(pens(only(d, WALL.new), graphics)).every((p) => p.stroke === '#cc0000' && p.width === 0.7), 'red, still heavy');
  });
});

describe('views without phases', () => {
  it('are drawn exactly as before: the same drawing object, every element, no phase on anything', async () => {
    assert.equal(phaseViewOf(undefined, undefined), null);
    assert.equal(phaseViewOf({ presetId: null }, undefined), null);
    for (const kind of ['plan', 'section', 'elevation'] as const) {
      const d = kind === 'plan' ? plan : await model.draw(kind);
      const same = styled(d, undefined);
      assert.equal(same, d, `${kind}: returned untouched`);
      assert.ok(d.lines.length > 0 && d.cutPolygons.length > 0, `${kind} draws something`);
      assert.equal(pens(same, undefined).length, pens(d, undefined).length);
      assert.ok(same.lines.every((l) => !('phase' in l)) && same.cutPolygons.every((p) => !('phase' in p)));
    }
  });

  it('keep their pens when phases are on and every phase is shown, except for the phase styles', async () => {
    for (const kind of ['section', 'elevation'] as const) {
      const d = await model.draw(kind);
      const all: ViewGraphics = { phases: { show: ['existing', 'demolish', 'new', 'temporary'] } };
      const shown = styled(d, all);
      assert.equal(shown.lines.length, d.lines.length, `${kind}: every line kept`);
      assert.equal(shown.cutPolygons.length, d.cutPolygons.length, `${kind}: every cut face kept`);
    }
  });
});

/** The DXF walker reads a path's stroke from its computed style, which the DOM shim leaves empty for a presentation attribute: read the attribute. */
const computedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = ((el: Element, pseudo?: string | null) => {
  const style = computedStyle(el, pseudo);
  return new Proxy(style, { get: (target, key) => (key === 'stroke' ? el.getAttribute('stroke') ?? '' : Reflect.get(target, key)) });
}) as typeof globalThis.getComputedStyle;

/** The drawing entities of a DXF with the line type each draws in: its own (group 6), else its layer's. */
function dxfEntities(dxf: string): { kind: string; layer: string; lineType: string }[] {
  const pairs = dxf.split(/\r?\n/).reduce<[string, string][]>((acc, line, i, all) => (i % 2 === 0 ? [...acc, [line.trim(), all[i + 1] ?? '']] : acc), []);
  const layerTypes = new Map<string, string>();
  const entities: { kind: string; layer: string; lineType?: string }[] = [];
  let table: { name?: string } | null = null;
  let current: { kind: string; layer: string; lineType?: string } | null = null;
  let section = '';
  for (const [code, value] of pairs) {
    if (code === '0') {
      current = section === 'ENTITIES' && (value === 'LINE' || value === 'LWPOLYLINE') ? { kind: value, layer: '' } : null;
      if (current) entities.push(current);
      table = section === 'TABLES' && value === 'LAYER' ? {} : null;
      if (value === 'SECTION') section = '?';
    } else if (code === '2' && section === '?') section = value;
    else if (table && code === '2') table.name = value;
    else if (table && code === '6' && table.name) layerTypes.set(table.name, value);
    else if (current && code === '8') current.layer = value;
    else if (current && code === '6') current.lineType = value;
  }
  return entities.map((e) => ({ kind: e.kind, layer: e.layer, lineType: e.lineType ?? layerTypes.get(e.layer) ?? '?' }));
}

/** A one-viewport sheet of the drawing as the view draws it: its SVG, and the DXF the same SVG exports. */
function sheetOf(drawing: StyledDrawing, graphics: ViewGraphics): { svg: string; dxf: string } {
  const view = { id: 'v', kind: 'plan', name: 'Plan', createdAt: 1, level: { name: 'EG', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, graphics } satisfies ProjectView;
  const sheet = { id: 's', number: 'A-1', name: 'Plan', createdAt: 1, paper: 'A1', orientation: 'landscape', titleBlock: {}, viewports: [{ id: 'vp', viewId: 'v', x: 400, y: 300, scale: 100, width: 700, height: 500, center: null }] } satisfies ProjectSheet;
  const ui = render(<SheetPaper sheet={sheet} projectName="FZK" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view, drawing, drafts: [] })} />);
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  assert.ok(svg, 'the sheet draws');
  return { svg: sheetSvgText(svg, sheet), dxf: new TextDecoder('windows-1252').decode(svgToDxf(svg, 594, 'test', 100)) };
}
