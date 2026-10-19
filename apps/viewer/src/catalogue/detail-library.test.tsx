/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { parsePat } from '@/drafting/hatch/pattern';
import { newDraft, commitDrafts, draftsOfView } from '@/drafting/draft-store';
import { draftingViewOf } from '@/drafting/drafting-view';
import { addDraftingMark } from '@/drafting/commands/detail';
import { settleDetailMarks } from '@/drafting/detail-mark';
import { allSymbols, placeSymbol } from '@/drafting/symbols';
import type { DraftEntity, EntityShape } from '@/drafting/types';
import { addProjectSheet, addProjectView, resetProject, setSheetNumber, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { defaultViews } from '@/project/view-defaults';
import { generatesFromModel, useViewDrawings } from '@/project/view-drawings';
import { sectionPlaneForView } from '@/project/view-plane';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { useSheetContent } from '@/components/viewer/sheets/useSheetContent';
import { selectKinds, serializeCatalogue, parseCatalogue } from './catalogue-file.js';
import { importCatalogueText, projectCatalogue } from './catalogue-store.js';
import { placeLibraryDetail, saveViewAsLibraryDetail } from './detail-actions.js';

/**
 * The detail library, end to end: a "Typical parapet" drafting view is drawn
 * once, placed on a detail sheet, saved to the library, carried through a
 * `.bvlib` file into a second project and placed there unchanged.
 */

const ROMANIAN = 'Atică din beton armat, șapă și țiglă Ș Ț Ă';
const PAT = '*MY-LINES, test\n0, 0,0, 0,0.05\n';
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => resetProject());
afterEach(() => cleanup());

/** Draw the parapet on a fresh drafting view of the current project. */
function drawParapet(): string {
  useProjectStore.setState({
    hatchPatterns: PAT,
    draftLayers: [...useProjectStore.getState().draftLayers, { id: 'L-detail', name: 'A-DETAIL', color: '#aa0000', visible: true, locked: false, lineWeight: 0.35 }],
    symbols: [{ id: 'sym-anchor', name: 'Anchor', unit: 'model', shapes: [{ type: 'circle', c: { x: 0, y: 0 }, r: 0.02 }] }],
  });
  const viewId = addProjectView(draftingViewOf('Typical parapet', 10));
  const shapes: [string, EntityShape, Record<string, string | number> ][] = [
    ['0', { type: 'line', a: { x: 0, y: 0 }, b: { x: 0.3, y: 0 } }, {}],
    ['L-detail', { type: 'line', a: { x: 0.3, y: 0 }, b: { x: 0.3, y: 0.6 } }, {}],
    ['0', { type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 0.3, y: 0.6 }, { x: 0, y: 0.6 }], closed: true }, {}],
    ['L-detail', { type: 'hatch', loops: [[{ x: 0.05, y: 0.05 }, { x: 0.25, y: 0.05 }, { x: 0.25, y: 0.5 }]], pattern: 'MY-LINES', scale: 1, angle: 0 }, {}],
    ['0', { type: 'symbol', symbolId: 'sym-anchor', p: { x: 0.15, y: 0.3 }, scale: 1, rotation: 0 }, { symbolScale: 1 }],
    ['0', { type: 'text', p: { x: 0.4, y: 0.3 }, text: ROMANIAN, height: 0.025, rotation: 0 }, { textStyle: 'standard' }],
  ];
  commitDrafts([...useProjectStore.getState().drafts, ...shapes.map(([layer, shape, params]) => newDraft(viewId, layer, shape, params))]);
  return viewId;
}

function SheetSvg({ sheetId }: { sheetId: string }) {
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === sheetId)) as ProjectSheet;
  const layers = useProjectStore((s) => s.draftLayers);
  const patterns = useProjectStore((s) => s.hatchPatterns);
  const { content } = useSheetContent(sheet);
  return <SheetPaper sheet={sheet} projectName="P" content={content} layers={layers} extraPatterns={parsePat(patterns ?? '').patterns} selectedViewportId={null} pxPerMm={1} />;
}

/** The sheet as exported, with the ids that differ between two projects made alike (entity ids, React's generated clip ids). */
function sheetSvg(sheetId: string): string {
  const ui = render(<SheetSvg sheetId={sheetId} />);
  const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId) as ProjectSheet;
  return sheetSvgText(svg, sheet).replace(/(viewport|sheet|view|draft|layer)-[0-9a-f-]{8,}/g, '$1-ID').replace(/_r_\d+_/g, '_r_N_');
}

/** What a view's drafts say, apart from their ids: shape, params and the NAME of their layer. */
function readable(viewId: string): unknown[] {
  const s = useProjectStore.getState();
  return draftsOfView(viewId, s.drafts).map((d: DraftEntity) => ({ layer: s.draftLayers.find((l) => l.id === d.layerId)?.name, shape: d.shape, params: d.params }));
}

describe('drafting view', () => {
  it('has no model drawing: nothing to generate, no plane to cut, and it places on a sheet framed on its drafts', () => {
    const viewId = drawParapet();
    const view = useProjectStore.getState().views.find((v) => v.id === viewId)!;
    assert.equal(generatesFromModel(view), false);
    assert.equal(generatesFromModel({ kind: 'plan' }), true);
    assert.equal(sectionPlaneForView(view, null, []), null);
    assert.equal(useViewDrawings.getState().byView[viewId], undefined);
    const sheetId = addProjectSheet('Details');
    addViewport(sheetId, viewId, { x: 200, y: 150 }, 10);
    const vp = useProjectStore.getState().sheets[0].viewports![0];
    assert.ok(vp.center && vp.width >= 40 && vp.height >= 30, 'framed on the drafts');
    assert.match(useProjectStore.getState().sheets[0].number, /^A-5\d\d$/, 'numbered in the details series');
  });

  it('prints its drafts on the sheet at the view scale, Romanian text included', () => {
    const viewId = drawParapet();
    const sheetId = addProjectSheet('Details');
    addViewport(sheetId, viewId, { x: 200, y: 150 }, 10);
    const svg = sheetSvg(sheetId);
    assert.ok(svg.includes(ROMANIAN), 'ș ț ă in the SVG');
    // The 0.3 m line at 1:10 is 30 mm long on paper.
    const line = /data-dxf-layer="0"[^>]* d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)"/.exec(svg);
    assert.ok(line, 'the first line is in the SVG');
    assert.equal(Math.round(Number(line[3]) - Number(line[1])), 30);
  });
});

describe('detail library', () => {
  it('draws once, saves, travels in a .bvlib to a second project and is placed unchanged', () => {
    const viewId = drawParapet();
    const sheetId = addProjectSheet('Details');
    addViewport(sheetId, viewId, { x: 200, y: 150 }, 10);
    const firstSvg = sheetSvg(sheetId);
    cleanup();
    const firstDrafts = readable(viewId);
    assert.equal(firstDrafts.length, 6);

    const entryId = saveViewAsLibraryDetail(viewId);
    assert.ok(entryId);
    const entry = useProjectStore.getState().details![0];
    assert.deepEqual(entry.layers.map((l) => l.name).sort(), ['0', 'A-DETAIL']);
    assert.match(entry.hatchPatterns, /MY-LINES/);
    assert.deepEqual(entry.symbols.map((s) => s.id), ['sym-anchor']);
    const file = serializeCatalogue(selectKinds(projectCatalogue(), new Set(['details'])), 'Office', new Date(0));
    assert.deepEqual(parseCatalogue(file).catalogue.details, [entry], 'the file round-trips the entry');

    // A fresh second project reads the library and places the detail.
    resetProject();
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    importCatalogueText(file, 'mine');
    const placed = placeLibraryDetail(useProjectStore.getState().details![0].id);
    assert.ok(placed);
    const view = useProjectStore.getState().views.find((v) => v.id === placed)!;
    assert.equal(view.kind, 'drafting');
    assert.equal(view.name, 'Typical parapet');
    assert.equal(view.scale, 10);
    assert.deepEqual(readable(placed), firstDrafts, 'equal ignoring ids');
    assert.ok(parsePat(useProjectStore.getState().hatchPatterns ?? '').patterns.some((p) => p.name === 'MY-LINES'), 'the pattern came along');
    assert.ok(useProjectStore.getState().symbols!.some((s) => s.id === 'sym-anchor'), 'the symbol came along');

    const secondSheet = addProjectSheet('Details');
    addViewport(secondSheet, placed, { x: 200, y: 150 }, 10);
    assert.equal(sheetSvg(secondSheet), firstSvg, 'the sheet prints the same, ignoring ids');
  });

  it('places twice with fresh ids: no draft or view id is shared', () => {
    const viewId = drawParapet();
    const entryId = saveViewAsLibraryDetail(viewId)!;
    const a = placeLibraryDetail(entryId)!;
    const b = placeLibraryDetail(entryId)!;
    const s = useProjectStore.getState();
    assert.notEqual(a, b);
    assert.equal(new Set(s.drafts.map((d) => d.id)).size, s.drafts.length, 'draft ids are unique');
    assert.equal(new Set(s.views.map((v) => v.id)).size, s.views.length, 'view ids are unique');
    assert.equal(draftsOfView(a).length, 6);
    assert.equal(draftsOfView(b).length, 6);
    assert.deepEqual(s.views.filter((v) => v.kind === 'drafting').map((v) => v.name), ['Typical parapet', 'Typical parapet (2)', 'Typical parapet (3)']);
  });

  it('keeps a Romanian text through the library file', () => {
    const viewId = drawParapet();
    saveViewAsLibraryDetail(viewId);
    const file = serializeCatalogue(selectKinds(projectCatalogue(), new Set(['details'])), 'Office');
    resetProject();
    importCatalogueText(file, 'mine');
    const placed = placeLibraryDetail(useProjectStore.getState().details![0].id)!;
    const text = draftsOfView(placed).find((d) => d.shape.type === 'text')!.shape as { text: string };
    assert.equal(text.text, ROMANIAN);
  });

  it('merges the layers it refers to under the clash policy', () => {
    const viewId = drawParapet();
    const entryId = saveViewAsLibraryDetail(viewId)!;
    const entry = useProjectStore.getState().details!;
    // A project that already has a layer of that name with another colour.
    resetProject();
    useProjectStore.setState({ details: entry, draftLayers: [...useProjectStore.getState().draftLayers, { id: 'mine', name: 'A-DETAIL', color: '#00aa00', visible: true, locked: false }] });
    const kept = placeLibraryDetail(entryId, 'mine')!;
    assert.ok(draftsOfView(kept).filter((d) => d.layerId === 'mine').length > 0, 'mine: drafts go to the project layer');
    assert.equal(useProjectStore.getState().draftLayers.find((l) => l.id === 'mine')!.color, '#00aa00');
    const both = placeLibraryDetail(entryId, 'both')!;
    const renamed = useProjectStore.getState().draftLayers.find((l) => l.name === 'A-DETAIL (2)');
    assert.ok(renamed, 'both: the incoming layer is kept under a new name');
    assert.ok(draftsOfView(both).some((d) => d.layerId === renamed!.id));
  });
});

describe('detail marks on a drafting view', () => {
  it('resolve to the sheet number and follow a renumbering', () => {
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const viewId = drawParapet();
    const number = addDraftingMark(plan.id, viewId, { x: 0, y: 0 }, { x: 2, y: 2 }, { textStyle: 'standard', dimStyle: 'standard' });
    assert.equal(number, 1);
    const label = () => (useProjectStore.getState().drafts.find((d) => d.viewId === plan.id && d.shape.type === 'text')!.shape as { text: string }).text;
    assert.equal(label(), '1', 'not on a sheet yet');
    const sheetId = addProjectSheet('Details');
    addViewport(sheetId, viewId, { x: 200, y: 150 }, 10);
    const sheetNumber = useProjectStore.getState().sheets[0].number;
    assert.equal(label(), `1/${sheetNumber}`);
    setSheetNumber(sheetId, 'D-7');
    assert.equal(label(), '1/D-7', 'follows the renumbering');
    const s = useProjectStore.getState();
    assert.equal(settleDetailMarks(s.drafts, s.views, s.sheets), s.drafts, 'settled');
    // Deleting the drafting view takes its mark with it.
    useProjectStore.setState({ views: s.views.filter((v) => v.id !== viewId) });
  });

  it('refuses a mark whose target is not a drafting view', () => {
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    assert.equal(addDraftingMark(plan.id, plan.id, { x: 0, y: 0 }, { x: 2, y: 2 }, { textStyle: 'standard', dimStyle: 'standard' }), null);
  });
});

describe('detail components', () => {
  const real = (id: string) => placeSymbol(allSymbols().find((s) => s.id === id)!, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  const extent = (id: string) => {
    const pts = real(id).geometry.flatMap((g) => (g.type === 'polyline' ? g.pts : []));
    return { w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) };
  };

  it('ship as model-unit symbols at their real size, so they scale with the drawing', () => {
    for (const id of ['builtin:batting', 'builtin:brick-course', 'builtin:ipe-200']) assert.equal(allSymbols().find((s) => s.id === id)?.unit, 'model', id);
    const ipe = extent('builtin:ipe-200');
    assert.ok(Math.abs(ipe.h - 0.2) < 1e-9 && Math.abs(ipe.w - 0.1) < 1e-9, 'IPE 200 is 200 x 100 mm');
    assert.ok(Math.abs(extent('builtin:brick-course').w - (5 * 0.215 + 4 * 0.01)) < 1e-9);
    assert.ok(Math.abs(extent('builtin:batting').h - 0.1) < 0.02, 'batting is about 100 mm thick');
  });
});
