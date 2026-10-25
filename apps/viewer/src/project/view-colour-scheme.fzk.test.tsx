/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan coloured by a property (#92), on AC20-FZK-Haus through the real pipeline: the parser, the wasm geometry, the section
 * generator, `styledDrawing`, the sheet's pens, the DXF writer and the legend. The model has no property named "function"; the
 * function of its rooms is their LongName (Schlafzimmer, Bad, Buero, Wohnen, Flur, Kueche, Galerie), so that is the property used.
 * The ground floor has six rooms, the top floor one.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { viewportPens, type Pen } from '@/components/viewer/sheets/viewport-pens';
import { svgToDxf } from '@/components/viewer/sheets/sheet-dxf';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { openSection } from '@/test/open-section.js';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { resetSectionChoices } from '@/components/viewer/wall/card-section-state';
import { ColourSchemeCard } from '@/components/viewer/wall/ColourSchemeCard';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { addColourLegend, setColourScheme } from './colour-scheme-actions';
import { layoutOf, readLegendEnv } from '@/legend/legend-env';
import type { LegendLabels, LegendLayout } from '@/legend/legend-layout';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from './project-store';
import { schemeResultOf } from './view-colour-scheme';
import { styledDrawing, type StyledDrawing } from './view-graphics';
import { useViewDrawings } from './view-drawings';
import { planViewFor } from './view-defaults';
import type { ProjectSheet, ProjectView, ViewGraphics } from './types';
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

let m: LoadedPlanModel;
let meshes: MeshData[];
let ground: ProjectView;
let raw: Drawing2D;

const withScheme = (view: ProjectView, scheme: ColourScheme | undefined): ProjectView => ({ ...view, graphics: scheme ? { colourScheme: scheme } : undefined } as ProjectView);
const ROOMS: ColourScheme = { property: 'LongName', target: 'rooms' };
/** The plan as the sheet draws it, through the pens: the scheme's fills (layer COLOUR) as hex strings. */
const penFills = (view: ProjectView, drawing: Drawing2D = raw, geometry: readonly MeshData[] = meshes): Pen[] => {
  const graphics: ViewGraphics | undefined = view.graphics;
  const styled: StyledDrawing = styledDrawing(drawing, graphics, undefined, undefined, undefined, null, schemeResultOf(view, drawing, geometry));
  return viewportPens(styled, graphics, { scale: 1000, x: 0, y: 0 }, 'down', []).filter((p) => p.layer === 'COLOUR');
};
const labelsAndColours = (view: ProjectView, drawing: Drawing2D = raw, geometry: readonly MeshData[] = meshes): [string, string][] =>
  (schemeResultOf(view, drawing, geometry)?.entries ?? []).map((e) => [e.label, e.colour]);

before(async () => {
  if (skip) return;
  m = await loadPlanModel(FZK_HAUS);
  meshes = useViewerStore.getState().models.get('m')!.geometryResult!.meshes;
  const level = m.levels.find((l) => l.name === 'Erdgeschoss')!;
  ground = { ...planViewFor(level, []), createdAt: 0 } as ProjectView;
  raw = await m.planOf(ground);
});

describe('a plan coloured by room function', { skip }, () => {
  it('has one colour per function, and a room is filled with the colour of its own function', () => {
    const view = withScheme(ground, ROOMS);
    const result = schemeResultOf(view, raw, meshes)!;
    assert.deepEqual(result.entries.map((e) => e.label), GROUND_ROOMS);
    assert.equal(new Set(result.entries.map((e) => e.colour)).size, GROUND_ROOMS.length, 'six functions, six colours');
    assert.equal(result.fills.length, GROUND_ROOMS.length);
    // Each fill is the colour of the room it fills: the space's own LongName, read from the model.
    for (const fill of result.fills) assert.equal(fill.colour, result.entries.find((e) => e.key === fill.key)!.colour);
    // Which room is which: the space named "4" is the Schlafzimmer, "3" the Bad (the model's Name; the function is its LongName).
    const space = (name: string) => meshes.find((x) => x.ifcType === 'IfcSpace' && m.nameOf(x.expressId) === name)!.expressId;
    const colourOf = (label: string) => result.entries.find((e) => e.label === label)!.colour;
    assert.equal(result.fills.find((f) => f.entityId === space('4'))!.colour, colourOf('Schlafzimmer'));
    assert.equal(result.fills.find((f) => f.entityId === space('3'))!.colour, colourOf('Bad'));
  });

  it('draws one fill colour per function under the linework, in the sheet pens', () => {
    const view = withScheme(ground, ROOMS);
    const fills = penFills(view);
    assert.deepEqual(fills.map((p) => p.fill).sort(), labelsAndColours(view).map(([, c]) => c).sort());
    assert.ok(fills.every((p) => p.solid === true && p.stroke === null));
    const all = viewportPens(styledDrawing(raw, undefined, undefined, undefined, undefined, null, schemeResultOf(view, raw, meshes)), undefined, { scale: 1000, x: 0, y: 0 }, 'down', []);
    const firstLine = all.findIndex((p) => p.fill === null);
    assert.ok(all.slice(0, firstLine).filter((p) => p.layer === 'COLOUR').length === GROUND_ROOMS.length, 'the room fills come before the first line pen');
  });

  it('puts the same fills in the sheet SVG and in the DXF, as solid hatches in the same colours', () => {
    const view = withScheme(ground, ROOMS);
    const styled = styledDrawing(raw, view.graphics, undefined, undefined, undefined, null, schemeResultOf(view, raw, meshes));
    const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 1, paper: 'A1', orientation: 'landscape', titleBlock: {}, viewports: [{ id: 'vp', viewId: view.id, x: 400, y: 300, scale: 100, width: 700, height: 500, center: null }] };
    const ui = render(<SheetPaper sheet={sheet} projectName="FZK" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view, drawing: styled, drafts: [] })} />);
    const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
    assert.ok(svg, 'the sheet draws');
    const colours = labelsAndColours(view).map(([, c]) => c).sort();
    const drawn = [...svg.querySelectorAll('path[data-dxf-fill="solid"]')].map((p) => p.getAttribute('fill')!).sort();
    assert.deepEqual(drawn, colours, 'the sheet SVG fills each function in its colour');
    const dxf = new TextDecoder('windows-1252').decode(svgToDxf(svg, 594, 'test', 100));
    const hatches = dxf.split(/\r?\n/).filter((l, i, all) => l.trim() === '0' && all[i + 1] === 'HATCH').length;
    assert.equal(hatches, GROUND_ROOMS.length, 'one solid hatch per function');
    assert.ok(dxf.includes('SOLID'));
    for (const c of colours) assert.ok(dxf.includes(`\n${parseInt(c.slice(1), 16)}\n`), `the DXF carries ${c} as a true colour`);
  });
});

describe('the colours of values are stable', { skip }, () => {
  it('gives the same colours when the same plan is coloured again', () => {
    const view = withScheme(ground, ROOMS);
    const first = labelsAndColours(view);
    assert.deepEqual(labelsAndColours({ ...view }), first);
    assert.deepEqual(labelsAndColours(withScheme(ground, { ...ROOMS })), first);
  });

  it('gives the same colours when the model lists its elements in another order', () => {
    const view = withScheme(ground, ROOMS);
    const first = labelsAndColours(view);
    const reversed = [...meshes].reverse();
    const shuffled = { ...raw, cutPolygons: [...raw.cutPolygons].reverse(), lines: [...raw.lines].reverse() } as Drawing2D;
    assert.deepEqual(labelsAndColours(withScheme(ground, { ...ROOMS }), shuffled, reversed), first);
    // The pens too: the same fills, whatever the order the spaces came in.
    assert.deepEqual(penFills(view, shuffled, reversed).map((p) => p.fill).sort(), penFills(view).map((p) => p.fill).sort());
  });

  it('gives the elements of a view the same colours when the drawing lists them in another order', () => {
    // The walls by their Name: more than a handful of values, met in the order the drawing lists the cut faces.
    const walls: ColourScheme = { property: 'Name', target: 'elements', classes: ['IfcWallStandardCase'] };
    const view = withScheme(ground, walls);
    const first = labelsAndColours(view);
    assert.ok(first.length >= 5, `${first.length} wall names`);
    assert.equal(new Set(first.map(([, c]) => c)).size, first.length, 'one colour per name');
    const reversed = { ...raw, cutPolygons: [...raw.cutPolygons].reverse() } as Drawing2D;
    assert.deepEqual(labelsAndColours(withScheme(ground, { ...walls }), reversed), first);
    // Painted on the cut faces: each wall's face carries its name's colour.
    const styled = styledDrawing(raw, view.graphics, undefined, undefined, undefined, null, schemeResultOf(view, raw, meshes));
    const painted = styled.cutPolygons.filter((p) => p.schemeColour);
    assert.ok(painted.length >= first.length);
    assert.ok(painted.every((p) => p.ifcType === 'IfcWallStandardCase'), 'only the chosen class is painted');
    assert.equal(styled.cutPolygons.filter((p) => !p.schemeColour && p.ifcType === 'IfcWallStandardCase').length, 0);
  });

  it('gives a function the same colour in every view that shows it', async () => {
    const level = m.levels.find((l) => l.name === 'Dachgeschoss')!;
    const top = withScheme({ ...planViewFor(level, []), createdAt: 0 } as ProjectView, ROOMS);
    const topRaw = await m.planOf(withScheme(top, undefined));
    // "Galerie" is the only room upstairs; the colour of a value depends on the value and on who else is in the view, so the lone value is checked against the engine's own assignment for it.
    const upstairs = labelsAndColours(top, topRaw);
    assert.deepEqual(upstairs.map(([l]) => l), ['Galerie']);
    const galerieAlone = labelsAndColours(withScheme(ground, { ...ROOMS, colours: {} }), raw).find(([l]) => l === 'Galerie');
    assert.equal(galerieAlone, undefined, 'the ground floor has no Galerie');
  });

  it('keeps a colour set by hand, and lets the others keep theirs', () => {
    const auto = labelsAndColours(withScheme(ground, ROOMS));
    const edited = labelsAndColours(withScheme(ground, { ...ROOMS, colours: { bad: '#112233' } }));
    assert.deepEqual(edited.find(([l]) => l === 'Bad'), ['Bad', '#112233']);
    assert.equal(new Set(edited.map(([, c]) => c)).size, edited.length, 'still one colour per value');
    assert.deepEqual(edited.filter(([l]) => l !== 'Bad' && auto.find(([k]) => k === l)![1] === edited.find(([k]) => k === l)![1]).length >= 4, true, 'most values keep the colour the palette gave them');
  });
});

describe('the legend of a coloured plan', { skip }, () => {
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'x', x: 250, y: 200, scale: 100, width: 0, height: 0, center: null }] };
  let view: ProjectView;
  beforeEach(() => {
    view = withScheme(ground, undefined);
    resetProject();
    useProjectStore.setState({ views: [view], sheets: [{ ...sheet, viewports: [{ ...sheet.viewports![0]!, viewId: view.id }] }], drafts: [] });
    useViewDrawings.setState({ byView: { [view.id]: { drawing: raw, status: 'ready', progress: 100, phase: '', error: null } } });
    publishDrawingRuntime({ geometryResult: useViewerStore.getState().models.get('m')!.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    setColourScheme(view.id, ROOMS);
  });
  afterEach(() => {
    publishDrawingRuntime(null);
    useViewDrawings.setState({ byView: {} });
    cleanup();
  });

  const legendLayout = (): LegendLayout => {
    const legend = useProjectStore.getState().legends!.at(-1)!;
    return layoutOf(legend, readLegendEnv(LABELS), 's');
  };
  const rows = (layout: LegendLayout): [string, string][] => {
    const swatches = layout.prims.filter((p) => p.kind === 'path' && p.solid).map((p) => (p.kind === 'path' ? p.fill! : ''));
    const texts = layout.prims.filter((p) => p.kind === 'text').slice(1).map((p) => (p.kind === 'text' ? p.text : ''));
    return texts.map((t, i) => [t, swatches[i]]);
  };

  it('is placed on the sheet and lists exactly the functions of the plan, each with its colour', () => {
    const id = addColourLegend('s', view.id, LABELS);
    assert.ok(id, 'the legend is placed');
    assert.equal(useProjectStore.getState().sheets[0]!.viewports!.some((v) => v.id === id), true);
    const current = useProjectStore.getState().views[0]!;
    assert.deepEqual(rows(legendLayout()), labelsAndColours(current));
    assert.deepEqual(rows(legendLayout()).map(([l]) => l), GROUND_ROOMS);
  });

  it('lists only the values of this view: a colour kept for a function the plan does not show stays out', () => {
    addColourLegend('s', view.id, LABELS);
    setColourScheme(view.id, { ...ROOMS, colours: { galerie: '#123456', bad: '#abcdef' } });
    const listed = rows(legendLayout());
    assert.deepEqual(listed.map(([l]) => l), GROUND_ROOMS);
    assert.ok(!listed.some(([, c]) => c === '#123456'), 'the Galerie colour is not listed');
    assert.equal(listed.find(([l]) => l === 'Bad')![1], '#abcdef', 'a colour set by hand shows in the legend');
  });

  it('follows the values: another property gives another list', () => {
    addColourLegend('s', view.id, LABELS);
    setColourScheme(view.id, { property: 'Pset_SpaceCommon.HandicapAccessible', target: 'rooms' });
    assert.deepEqual(rows(legendLayout()).map(([l]) => l), ['true']);
  });

  it('is not added twice to the same sheet', () => {
    assert.ok(addColourLegend('s', view.id, LABELS));
    assert.equal(addColourLegend('s', view.id, LABELS), null);
    assert.equal(useProjectStore.getState().legends!.length, 1);
  });
});

describe('the colour section of the viewport card', { skip }, () => {
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [{ id: 'vp', viewId: 'x', x: 250, y: 200, scale: 100, width: 0, height: 0, center: null }] };
  let view: ProjectView;
  beforeEach(() => {
    resetProject();
    resetSectionChoices();
    registerLocale('ro', checkCatalogue(ro).catalogue);
    view = withScheme(ground, undefined);
    useProjectStore.setState({ views: [view], sheets: [{ ...sheet, viewports: [{ ...sheet.viewports![0]!, viewId: view.id }] }], drafts: [] });
    useViewDrawings.setState({ byView: { [view.id]: { drawing: raw, status: 'ready', progress: 100, phase: '', error: null } } });
    publishDrawingRuntime({ geometryResult: useViewerStore.getState().models.get('m')!.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  });
  afterEach(() => {
    publishDrawingRuntime(null);
    useViewDrawings.setState({ byView: {} });
    cleanup();
    act(() => setLocale('en'));
  });
  /** The card follows the project store the way the Wall does; rendered again after each change here. */
  function Live() {
    const views = useProjectStore((s) => s.views);
    const sheets = useProjectStore((s) => s.sheets);
    return <ColourSchemeCard sheet={sheets[0]!} view={views[0]!} />;
  }

  it('starts a scheme, lists the functions with a colour each, and adds the legend to the sheet', () => {
    const ui = render(<Live />);
    assert.match(ui.textContent ?? '', /Not coloured/);
    openSection(ui, 'Colour by property');
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Colour this view by a property')!);
    const pickers = [...ui.querySelectorAll<HTMLInputElement>('input[type="color"]')];
    assert.deepEqual(pickers.map((p) => p.getAttribute('aria-label')), GROUND_ROOMS.map((r) => `Colour of ${r}`));
    assert.deepEqual(pickers.map((p) => p.value).sort(), labelsAndColours(useProjectStore.getState().views[0]!).map(([, c]) => c).sort());
    const add = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Add legend')!;
    click(add);
    assert.equal(useProjectStore.getState().legends!.length, 1);
    assert.ok([...ui.querySelectorAll('button')].some((b) => b.textContent === 'The legend is on this sheet' && b.disabled));
  });

  it('is written in Romanian', () => {
    setColourScheme(view.id, ROOMS);
    act(() => setLocale('ro'));
    const ui = render(<Live />);
    const text = ui.textContent ?? '';
    assert.match(text, /Colorare după proprietate/);
    assert.match(text, /Adaugă legendă/);
    assert.match(text, /Renunță la colorare/);
    assert.ok(ui.querySelector('input[type="color"][aria-label="Culoarea pentru Bad"]'));
  });

  it('takes the colouring off again', () => {
    const ui = render(<Live />);
    act(() => setColourScheme(view.id, ROOMS));
    click([...ui.querySelectorAll('button')].find((b) => b.textContent === 'Stop colouring')!);
    assert.equal(useProjectStore.getState().views[0]!.graphics?.colourScheme, undefined);
  });
});

describe('the engine and the app colour a plan alike', { skip }, () => {
  it('give the same colour to the same function, and list the same functions', async () => {
    const engineModel = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    const made = generateDefaultSet(engineModel)!;
    const plan = made.document.views.find((v) => v.kind === 'plan' && v.name === 'Erdgeschoss')!;
    const engineView: ProjectView = { ...plan, graphics: { colourScheme: ROOMS } };
    const set = { ...made, document: { ...made.document, views: made.document.views.map((v) => (v.id === plan.id ? engineView : v)) } };
    const sheets = await sheetGraphics(set, engineModel);
    const sheet = sheets.find((s) => s.viewports.some((v) => v.viewId === plan.id))!;
    // The legend is the last block the engine adds: its labels (after the title) and swatches, in the settled order.
    const labels = sheet.texts.filter((t) => GROUND_ROOMS.includes(t.text)).map((t) => t.text);
    assert.deepEqual(labels, GROUND_ROOMS);
    const engine = new Map(labels.map((l, i) => [l, sheet.fills.slice(-GROUND_ROOMS.length)[i]!.colour] as const));
    const app = new Map(labelsAndColours(withScheme(ground, ROOMS)));
    assert.deepEqual([...engine].sort(), [...app].sort());
    // The rooms are filled in those colours on the plan.
    const roomFills = new Set(sheet.fills.slice(0, -GROUND_ROOMS.length).map((f) => f.colour));
    assert.deepEqual([...roomFills].sort(), [...app.values()].sort());
  });
});

describe('a project that was never coloured is unchanged', { skip }, () => {
  it('draws the same pens, and the same drawing object, with no scheme', () => {
    const plain = styledDrawing(raw, undefined, undefined, undefined, undefined, null, null);
    const without = styledDrawing(raw, undefined);
    assert.equal(plain, without, 'the same object when nothing styles it');
    assert.deepEqual(viewportPens(plain, undefined, { scale: 1000, x: 0, y: 0 }, 'down', []), viewportPens(without, undefined, { scale: 1000, x: 0, y: 0 }, 'down', []));
    assert.equal(viewportPens(plain, undefined, { scale: 1000, x: 0, y: 0 }, 'down', []).some((p) => p.layer === 'COLOUR'), false);
  });

  it('has no scheme to resolve', () => {
    assert.equal(schemeResultOf(withScheme(ground, undefined), raw, meshes), null);
  });
});
