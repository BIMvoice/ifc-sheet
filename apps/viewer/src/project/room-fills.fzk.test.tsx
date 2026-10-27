/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Room fills (#493) in the app, on AC20-FZK-Haus through the real pipeline: the ground-floor plan with its rooms filled by name and
 * the Wohnen hatched with PARQUET. The sheet's SVG, the DXF (a HATCH of the pattern over the solid ones), the legend and the card
 * all read the one scheme; the view's switch takes the fills away, and a view template carries them.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { viewportPens, type Pen } from '@/components/viewer/sheets/viewport-pens';
import { svgToDxf } from '@/components/viewer/sheets/sheet-dxf';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { ColourSchemeCard } from '@/components/viewer/wall/ColourSchemeCard';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { layoutOf, readLegendEnv } from '@/legend/legend-env';
import type { LegendLabels, LegendLayout } from '@/legend/legend-layout';
import { useViewerStore } from '@/store';
import { addColourLegend, setColourScheme } from './colour-scheme-actions';
import { resetProject, useProjectStore } from './project-store';
import { schemeResultOf } from './view-colour-scheme';
import { styledDrawing, type StyledDrawing } from './view-graphics';
import { useViewDrawings } from './view-drawings';
import { planViewFor } from './view-defaults';
import type { ProjectSheet, ProjectView } from './types';
import type { ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';

const skip = planModelMissing(FZK_HAUS);

/** The DXF walker reads a fill from its computed style, which the DOM shim leaves empty for a presentation attribute: read the attribute. */
const computedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = ((el: Element, pseudo?: string | null) => {
  const style = computedStyle(el, pseudo);
  return new Proxy(style, { get: (target, key) => (key === 'stroke' || key === 'fill' ? el.getAttribute(key) ?? '' : Reflect.get(target, key)) });
}) as typeof globalThis.getComputedStyle;

const LABELS: LegendLabels = {
  heading: { materials: 'Materials', layers: 'Layers', hatches: 'Hatches', symbols: 'Symbols', annotations: 'Annotations', colours: 'Colours' },
  tool: (tool) => tool,
  continued: (heading) => `${heading} (continued)`,
  membrane: 'membrane',
  sampleText: 'Abc',
};
const GROUND_ROOMS = ['Bad', 'Buero', 'Flur', 'Küche', 'Schlafzimmer', 'Wohnen'];
const FLAT: ColourScheme = { property: 'LongName', target: 'rooms' };
const HATCHED: ColourScheme = { ...FLAT, hatches: { wohnen: 'PARQUET' } };
const T = { scale: 1000, x: 0, y: 0 };

let m: LoadedPlanModel;
let meshes: MeshData[];
let ground: ProjectView;
let raw: Drawing2D;

const withScheme = (view: ProjectView, scheme: ColourScheme | undefined): ProjectView => ({ ...view, graphics: scheme ? { colourScheme: scheme } : undefined } as ProjectView);
const styled = (view: ProjectView): StyledDrawing => styledDrawing(raw, view.graphics, undefined, undefined, undefined, null, schemeResultOf(view, raw, meshes));
const pensOf = (view: ProjectView, unit?: number, scale = T.scale): Pen[] => viewportPens(styled(view), view.graphics, { ...T, scale }, 'down', [], undefined, undefined, undefined, undefined, unit);
const hatchPens = (view: ProjectView): Pen[] => pensOf(view).filter((p) => p.schemeHatch);
const sheetOf = (view: ProjectView): ProjectSheet => ({ id: 's', number: 'A-101', name: 'Plans', createdAt: 1, paper: 'A1', orientation: 'landscape', titleBlock: {}, viewports: [{ id: 'vp', viewId: view.id, x: 400, y: 300, scale: 100, width: 700, height: 500, center: null }] });
const svgOf = (view: ProjectView): SVGSVGElement => {
  const ui = render(<SheetPaper sheet={sheetOf(view)} projectName="FZK" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view, drawing: styled(view), drafts: [] })} />);
  return ui.querySelector('svg') as unknown as SVGSVGElement;
};
const entities = (dxf: string, kind: string): number => dxf.split(/\r?\n/).filter((l, i, all) => l.trim() === '0' && all[i + 1] === kind).length;
const decode = (svg: SVGSVGElement): string => new TextDecoder('windows-1252').decode(svgToDxf(svg, 594, 'test', 100));

before(async () => {
  if (skip) return;
  m = await loadPlanModel(FZK_HAUS);
  meshes = useViewerStore.getState().models.get('m')!.geometryResult!.meshes;
  const level = m.levels.find((l) => l.name === 'Erdgeschoss')!;
  ground = { ...planViewFor(level, []), createdAt: 0 } as ProjectView;
  raw = await m.planOf(ground);
});

describe('rooms filled by name with one value hatched', { skip }, () => {
  it('hatches only the rooms of that value, in the scheme\'s result and in the entries the legend lists', () => {
    const result = schemeResultOf(withScheme(ground, HATCHED), raw, meshes)!;
    assert.deepEqual(result.entries.map((e) => [e.label, e.hatch]), GROUND_ROOMS.map((r) => [r, r === 'Wohnen' ? 'PARQUET' : undefined]));
    assert.deepEqual(result.fills.filter((f) => f.hatch).map((f) => f.key), ['wohnen']);
    assert.deepEqual(result.entries.map((e) => e.colour), schemeResultOf(withScheme(ground, FLAT), raw, meshes)!.entries.map((e) => e.colour), 'the colours do not move when a hatch is added');
  });

  it('draws the pattern as a hairline pen over the colours and under every line, in the printed size at the sheet\'s scale', () => {
    // A sheet at 1:100 is 10 paper millimetres to the metre.
    const all = pensOf(withScheme(ground, HATCHED), 0.1, 10);
    const hatch = all.filter((p) => p.schemeHatch);
    assert.equal(hatch.length, 1);
    assert.equal(hatch[0].schemeHatch!.name, 'PARQUET');
    assert.ok(hatch[0].d.split('M').length > 10, 'the room is hatched all over');
    assert.equal(hatch[0].schemeHatch!.unit, 1, 'a pattern millimetre is a paper millimetre at 1:100');
    const colours = all.map((p, i) => (p.layer === 'COLOUR' ? i : -1)).filter((i) => i >= 0);
    const firstLine = all.findIndex((p) => p.fill === null && !p.schemeHatch);
    assert.ok(colours.length === GROUND_ROOMS.length && Math.max(...colours) < all.indexOf(hatch[0]) && all.indexOf(hatch[0]) < firstLine);
    // At 1:50 the pattern keeps its printed size: half the drawing metres per pattern millimetre, twice the paper per metre.
    assert.equal(pensOf(withScheme(ground, HATCHED), 0.05, 20).find((p) => p.schemeHatch)!.schemeHatch!.unit, 1);
    assert.equal(hatchPens(withScheme(ground, FLAT)).length, 0);
  });

  it('puts the hatch in the sheet SVG and in the DXF as a HATCH of the pattern over the solid ones, with no loose lines', () => {
    const flat = decode(svgOf(withScheme(ground, FLAT)));
    cleanup();
    const view = withScheme(ground, HATCHED);
    const svg = svgOf(view);
    assert.equal(svg.querySelectorAll('path[data-dxf-pattern="PARQUET"]').length, 1);
    assert.equal(svg.querySelectorAll('path[data-export-ignore-dxf="true"]').length, 1, 'the strokes are on the sheet and not in the DXF');
    const dxf = decode(svg);
    assert.equal(entities(dxf, 'HATCH'), GROUND_ROOMS.length + 1, 'one solid hatch per value and the pattern over the Wohnen');
    assert.ok(dxf.includes('\nPARQUET\n'));
    // The pattern's definition lines travel with it: two families, one horizontal and one vertical.
    const lines = dxf.split(/\r?\n/).map((l) => l.trim());
    const at = lines.indexOf('PARQUET');
    const after = lines.slice(at);
    assert.equal(after[after.indexOf('78') + 1], '2');
    assert.equal(entities(dxf, 'LINE') + entities(dxf, 'LWPOLYLINE'), entities(flat, 'LINE') + entities(flat, 'LWPOLYLINE'), 'no stroke of the pattern is written as a line');
    assert.equal(entities(flat, 'HATCH'), GROUND_ROOMS.length);
    assert.ok(!flat.includes('\nPARQUET\n'));
  });

  it('draws nothing when the view\'s switch is off, and keeps the scheme to switch on again', () => {
    const off = withScheme(ground, { ...HATCHED, off: true });
    assert.equal(schemeResultOf(off, raw, meshes), null);
    assert.equal(pensOf(off).filter((p) => p.layer === 'COLOUR' || p.schemeHatch).length, 0);
    const svg = svgOf(off);
    assert.equal(svg.querySelectorAll('path[data-dxf-fill="solid"], path[data-dxf-pattern]').length, 0);
    assert.equal(entities(decode(svg), 'HATCH'), 0);
    assert.deepEqual(pensOf(off), pensOf(withScheme(ground, undefined)), 'the plan is drawn as if it had no scheme');
  });
});

describe('a view template carries room fills', { skip }, () => {
  it('fills a view that follows it, and the view\'s own scheme wins', () => {
    resetProject();
    const template = { id: 'vt-rooms', name: 'Rooms by name', kind: 'plan' as const, graphics: { colourScheme: HATCHED } };
    useProjectStore.setState({ viewTemplates: [template] });
    const followed = { ...ground, templateId: 'vt-rooms', graphics: undefined } as ProjectView;
    assert.deepEqual(schemeResultOf(followed, raw, meshes)!.entries, schemeResultOf(withScheme(ground, HATCHED), raw, meshes)!.entries);
    assert.equal(hatchPens(followed).length, 1);
    const own = { ...followed, graphics: { colourScheme: FLAT } } as ProjectView;
    assert.equal(hatchPens(own).length, 0);
    const off = { ...followed, graphics: { colourScheme: { ...HATCHED, off: true as const } } } as ProjectView;
    assert.equal(schemeResultOf(off, raw, meshes), null, 'a view can switch its template\'s fills off');
    resetProject();
  });
});

describe('the legend of hatched rooms', { skip }, () => {
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'x', x: 250, y: 200, scale: 100, width: 0, height: 0, center: null }] };
  let view: ProjectView;
  beforeEach(() => {
    view = withScheme(ground, undefined);
    resetProject();
    useProjectStore.setState({ views: [view], sheets: [{ ...sheet, viewports: [{ ...sheet.viewports![0]!, viewId: view.id }] }], drafts: [] });
    useViewDrawings.setState({ byView: { [view.id]: { drawing: raw, status: 'ready', progress: 100, phase: '', error: null } } });
    publishDrawingRuntime({ geometryResult: useViewerStore.getState().models.get('m')!.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  afterEach(() => {
    publishDrawingRuntime(null);
    useViewDrawings.setState({ byView: {} });
    cleanup();
  });
  const layout = (): LegendLayout => layoutOf(useProjectStore.getState().legends!.at(-1)!, readLegendEnv(LABELS), 's');
  const lineCount = (l: LegendLayout): number => l.prims.filter((p) => p.kind === 'line').length;

  it('draws the pattern over the colour of the hatched value\'s swatch, and lists it with the others', () => {
    setColourScheme(view.id, FLAT);
    assert.ok(addColourLegend('s', view.id, LABELS));
    const plain = layout();
    setColourScheme(view.id, HATCHED);
    const hatched = layout();
    assert.deepEqual(hatched.prims.filter((p) => p.kind === 'text').slice(1).map((p) => (p.kind === 'text' ? p.text : '')), GROUND_ROOMS);
    assert.equal(hatched.prims.filter((p) => p.kind === 'path' && p.solid).length, GROUND_ROOMS.length, 'every value keeps its colour swatch');
    assert.ok(lineCount(hatched) > lineCount(plain), 'the parquet swatch carries the pattern\'s strokes');
  });

  it('is empty while the view\'s switch is off', () => {
    setColourScheme(view.id, { ...HATCHED, off: true });
    addColourLegend('s', view.id, LABELS);
    assert.equal(layout().prims.filter((p) => p.kind === 'path' && p.solid).length, 0);
  });
});

describe('the hatch and switch controls of the viewport card', { skip }, () => {
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'x', x: 250, y: 200, scale: 100, width: 0, height: 0, center: null }] };
  let view: ProjectView;
  beforeEach(() => {
    resetProject();
    resetSectionChoices();
    view = withScheme(ground, undefined);
    useProjectStore.setState({ views: [view], sheets: [{ ...sheet, viewports: [{ ...sheet.viewports![0]!, viewId: view.id }] }], drafts: [] });
    useViewDrawings.setState({ byView: { [view.id]: { drawing: raw, status: 'ready', progress: 100, phase: '', error: null } } });
    publishDrawingRuntime({ geometryResult: useViewerStore.getState().models.get('m')!.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  afterEach(() => {
    publishDrawingRuntime(null);
    useViewDrawings.setState({ byView: {} });
    cleanup();
  });
  function Live() {
    const views = useProjectStore((s) => s.views);
    const sheets = useProjectStore((s) => s.sheets);
    return <ColourSchemeCard sheet={sheets[0]!} view={views[0]!} />;
  }
  const stored = (): ColourScheme | undefined => useProjectStore.getState().views[0]!.graphics?.colourScheme;

  it('lets each room value take a pattern, and writes it to the view', () => {
    const ui = render(<Live />);
    act(() => setColourScheme(view.id, FLAT));
    openSection(ui, 'Colour by property');
    const select = ui.querySelector<HTMLSelectElement>('select[aria-label="Hatch of Wohnen"]')!;
    assert.ok(select, 'a hatch choice per value');
    assert.ok([...select.options].some((o) => o.value === 'PARQUET'), 'the parquet pattern is offered');
    assert.ok(![...select.options].some((o) => o.value === 'SOLID'));
    act(() => { select.value = 'PARQUET'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.deepEqual(stored()!.hatches, { wohnen: 'PARQUET' });
    act(() => { select.value = ''; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(stored()!.hatches, undefined);
  });

  it('switches the fills off and on without losing the settings', () => {
    const ui = render(<Live />);
    act(() => setColourScheme(view.id, HATCHED));
    openSection(ui, 'Colour by property');
    const box = [...ui.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((c) => c.parentElement?.textContent === 'Show the fills in this view')!;
    assert.equal(box.checked, true);
    click(box);
    assert.equal(stored()!.off, true);
    assert.deepEqual(stored()!.hatches, { wohnen: 'PARQUET' }, 'the hatch is kept');
    assert.match(ui.textContent ?? '', /Switched off/);
    click(ui.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    assert.equal(stored()!.off, undefined);
  });
});
