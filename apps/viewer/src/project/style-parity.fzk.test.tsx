/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One style path (#34): the same view looks the same in the drafting view, on a sheet, in the sheet's PDF and DXF, in the view's
 * DXF and in the command line's PDF and DXF. AC20-FZK-Haus's ground-floor plan through the real pipeline, styled by a preset with
 * a property rule (fire safety: a door with a FireRating red and heavy), a category override (stairs), an element override (one
 * wall) and a colour scheme (one window painted), with one element hidden. Every face and line is drawn by:
 *
 *  - the drafting view: the canvas styler `useViewCanvasStyler` hands `Drawing2DCanvas`;
 *  - the sheet: `viewportPens` with the styler `SheetPaper` passes (its SVG is the PDF, its pen tags the DXF);
 *  - the view's DXF: `viewportPens` with no styler, as `view-dxf.tsx` calls it;
 *  - the headless sheet: the engine's `sheetGraphic` with the command line's property reader.
 *
 * and they must agree on visibility, colour, pen, dash and fill.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import { headlessPropertiesOf, sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { viewportPens, type Pen } from '@/components/viewer/sheets/viewport-pens';
import { useViewCanvasStyler } from '@/components/viewer/drafting/useViewCanvasStyler';
import type { CanvasStyler } from '@/components/viewer/drawing/canvas-item-style';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { renderIdGlobalId } from './element-guid';
import { appViewStyler } from './view-styler';
import { planViewFor } from './view-defaults';
import { withScheme } from './view-scheme-style';
import type { StyledDrawing } from './view-graphics';
import type { ProjectView, ViewGraphics } from './types';

const MM = { scale: 1000, x: 0, y: 0 };

/** The pen a sheet gives one item: `viewportPens` over a drawing holding that item alone. */
function sheetPenOf(drawing: StyledDrawing, item: DrawingPolygon | DrawingLine, graphics: ViewGraphics, explicitStyler: boolean): Pen | null {
  const alone = { ...drawing, schemeFills: [], cutPolygons: 'polygon' in item ? [item] : [], lines: 'polygon' in item ? [] : [item] } as unknown as StyledDrawing;
  const pens = explicitStyler
    ? viewportPens(alone, graphics, MM, 'down', [], undefined, undefined, DEFAULT_GRAPHIC_STANDARD, appViewStyler(graphics, drawing, DEFAULT_GRAPHIC_STANDARD))
    : viewportPens(alone, graphics, MM, 'down', []);
  assert.ok(pens.length <= 1, 'one item, one pen');
  return pens[0] ?? null;
}

/** The canvas styler the drafting view builds, through its own hook. */
function canvasStylerOf(graphics: ViewGraphics, drawing: Drawing2D): CanvasStyler {
  let styler: CanvasStyler | null = null;
  function Probe() {
    styler = useViewCanvasStyler(graphics, drawing);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  assert.ok(styler);
  return styler;
}

describe('one style path for AC20-FZK-Haus\'s ground floor (#34)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let m: LoadedPlanModel;
  let view: ProjectView;
  let graphics: ViewGraphics;
  let shown: StyledDrawing;
  let raw: Drawing2D;
  let ids: { overridden: number; hidden: number; painted: number; stair: number; fireDoor: number; plainDoor: number };
  const scheme = (painted: number): SchemeResult => ({ fills: [], elementColours: new Map([[painted, '#ff8800']]), entries: [] });

  before(async () => {
    m = await loadPlanModel(FZK_HAUS);
    const level = m.levels.find((l) => l.name === 'Erdgeschoss')!;
    const ground = { ...planViewFor(level, []), createdAt: 0, id: 'v-ground' } as ProjectView;
    raw = await m.planOf(ground, { omits: 'none' });
    const cutIds = (type: string) => [...new Set(raw.cutPolygons.filter((p) => p.ifcType === type).map((p) => p.entityId))];
    const [walls, doors, stairs, windows] = ['IfcWallStandardCase', 'IfcDoor', 'IfcStair', 'IfcWindow'].map(cutIds);
    assert.ok(walls.length >= 3 && doors.length >= 2 && stairs.length >= 1 && windows.length >= 1, 'the plan cuts walls, doors, a stair and windows');
    const ds = [...useViewerStore.getState().models.values()][0].ifcDataStore!;
    const rated = (id: number) => Object.values(headlessPropertiesOf(ds)(id)).some((set) => 'FireRating' in set);
    const fireDoors = doors.filter(rated);
    assert.ok(fireDoors.length >= 1 && fireDoors.length < doors.length, 'some doors, not all, have a FireRating (the property rule has something to match, and something not to)');
    ids = { overridden: walls[0], hidden: walls[1], painted: windows[0], stair: stairs[0], fireDoor: fireDoors[0], plainDoor: doors.find((d) => !rated(d))! };
    graphics = {
      presetId: 'preset-fire-safety',
      categories: { stairs: { lineColor: '#006600', lineWeight: 'light', fillColor: '#ddffdd' } },
      elements: { [renderIdGlobalId(ids.overridden)!]: { lineColor: '#808080', cutWeight: 'medium', projectionWeight: 'light', lineStyle: 'dashed', fillColor: '#101010' } },
      hiddenElements: [renderIdGlobalId(ids.hidden)!],
    };
    view = { ...ground, graphics };
    shown = withScheme(await m.planOf(view, { omits: 'none' }) as StyledDrawing, scheme(ids.painted));
  });

  it('the styles are not all alike: the preset, its property rule, the category, the element and the scheme each speak', () => {
    const styler = appViewStyler(graphics, shown, DEFAULT_GRAPHIC_STANDARD);
    const face = (id: number) => styler.face(shown.cutPolygons.find((p) => p.entityId === id)!);
    assert.deepEqual([face(ids.fireDoor).stroke, face(ids.fireDoor).weight], ['#C62828', 0.7], 'the property rule (a door with a FireRating), its weight through the pen table');
    assert.notEqual(face(ids.plainDoor).stroke, '#C62828', 'a door without one is not matched');
    assert.deepEqual([face(ids.stair).fill, face(ids.stair).stroke, face(ids.stair).weight], ['#ddffdd', '#006600', 0.25], 'the category');
    assert.deepEqual([face(ids.overridden).stroke, face(ids.overridden).weight, face(ids.overridden).dash, face(ids.overridden).fill], ['#808080', 0.5, [3, 1.5], '#101010'], 'the element');
    assert.equal(face(ids.painted).fill, '#ff8800', 'the scheme fill over everything');
    assert.ok(!m.drawnIds(shown).has(ids.hidden), 'the hidden wall is not in the drawing');
  });

  it('the drafting view, the sheet and the view\'s DXF give every face and line the same pen', () => {
    const canvas = canvasStylerOf(graphics, shown);
    let compared = 0;
    for (const p of shown.cutPolygons as DrawingPolygon[]) {
      const screen = canvas.face(p);
      for (const explicit of [true, false]) {
        const pen = sheetPenOf(shown, p, graphics, explicit)!;
        assert.equal(pen.fill, screen.fill, `fill of ${p.ifcType} #${p.entityId}`);
      }
      // The outline the canvas strokes is the cut line the sheet draws for that element.
      const cutLine = shown.lines.find((l) => l.entityId === p.entityId && l.category === 'cut');
      if (cutLine) {
        const pen = sheetPenOf(shown, cutLine, graphics, true)!;
        assert.deepEqual([pen.stroke, pen.width, pen.dash ?? ''], [screen.stroke, screen.weight, screen.dash.join(' ')], `outline of ${p.ifcType} #${p.entityId}`);
      }
      compared++;
    }
    for (const l of shown.lines as DrawingLine[]) {
      const screen = canvas.line(l);
      for (const explicit of [true, false]) {
        const pen = sheetPenOf(shown, l, graphics, explicit);
        assert.ok(pen, 'every line the view keeps is on the sheet');
        if (l.category === 'cut') {
          assert.equal(screen, null, 'the canvas draws a cut line as its face\'s outline');
          continue;
        }
        assert.ok(screen, 'and on the screen');
        assert.deepEqual([pen.stroke, pen.width, pen.dash ?? ''], [screen.stroke, screen.weight, screen.dash.join(' ')], `${l.category} line of ${l.ifcType} #${l.entityId}`);
      }
      compared++;
    }
    assert.ok(compared > 100, `compared ${compared} items`);
  });

  it('the command line\'s sheet of the same drawing carries the same pens', () => {
    const ds = [...useViewerStore.getState().models.values()][0].ifcDataStore!;
    const sheet = { id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A0', orientation: 'landscape', viewports: [{ id: 'vp', viewId: view.id, x: 600, y: 400, scale: 100, width: 0, height: 0, center: null }] };
    const doc = { name: 'FZK', models: [], sheets: [sheet], views: [view] };
    // The drawing as the generator made it: the engine applies the view itself (hiding, the rules, the element, by GlobalId).
    const headless = sheetGraphic(sheet as never, doc as never, new Map([[view.id, raw]]), null, new Map([[view.id, scheme(ids.painted)]]), (id) => renderIdGlobalId(id) ?? undefined, headlessPropertiesOf(ds));
    const app = viewportPens(shown, graphics, MM, 'down', []);
    const key = (p: { layer: string; stroke: string | null; width: number; fill: string | null; dash?: string | readonly number[] }) =>
      `${p.layer}|${p.stroke}|${p.width}|${p.fill}|${Array.isArray(p.dash) ? p.dash.join(' ') : p.dash ?? ''}`;
    // A face a scheme paints is in the headless sheet's `fills` (under the linework), not among its pens.
    const appKeys = new Set(app.filter((p) => p.layer !== 'COLOUR' && p.layer !== 'HATCH').map(key));
    const headlessKeys = new Set(headless.pens.map(key));
    assert.deepEqual([...headlessKeys].sort(), [...appKeys].sort());
    assert.ok(headless.fills.some((f) => f.colour === '#ff8800'), 'the scheme paints the window there too');
    assert.ok([...appKeys].some((k) => k.startsWith('CUT|#C62828|0.7')), 'the property rule\'s pen is among them');
    assert.ok([...appKeys].some((k) => k.startsWith('CUT|#808080|0.5|null|3 1.5')), 'the element\'s pen is among them');
  });
});
