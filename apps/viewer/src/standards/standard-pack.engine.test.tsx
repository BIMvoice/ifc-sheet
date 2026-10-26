/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { PEN_TABLE, TITLE_BLOCK_CAPTIONS_RO, romaniaPack, type ProjectDocument as EngineDocument, type RoCaption } from '@bimvoice/ifcsheet';
import { readProjectFile, sheetGraphic, type ProjectFacts } from '@bimvoice/ifcsheet/headless';
import { cleanup, render } from '@/test/render.js';
import { addProjectSheet, addProjectView, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { serializeProject } from '@/project/project-file';
import { effectiveTitleBlock } from '@/project/title-block-model';
import { setProjectTitleBlockField } from '@/project/sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { sheetsRo } from '@/i18n/catalogues/sheets.ro';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import { titleBlockSourcesRo } from '@/i18n/catalogues/title-block-sources.ro';
import { installStandard } from './standard-pack-install';

/**
 * A project saved in the app with the Romanian pack installed (#365), read by the engine package (what `ifcsheet build --project`
 * does): the same title block texts in the same order, and the same pens, as the sheet on screen. The engine reads the pens and the
 * layout from the saved file, so a reader that ignores either turns this red.
 */

const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 5, includeHiddenLines: false, creaseAngle: 30, scale: 100 },
  lines: [
    { line: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 },
    { line: { start: { x: 0, y: 1 }, end: { x: 4, y: 1 } }, category: 'projection', visibility: 'visible', entityId: 2, ifcType: 'IfcDoor', modelIndex: 0, depth: 0.5 },
  ],
  cutPolygons: [{ polygon: { outer: square(0, 0, 4), holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 4 } },
} as unknown as Drawing2D;

let view: ProjectView;

beforeEach(() => {
  resetProject();
  const viewId = addProjectView({ kind: 'plan', name: 'Parter', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  view = useProjectStore.getState().views.find((v) => v.id === viewId)!;
  for (const name of ['Planuri', 'Secțiuni']) {
    const id = addProjectSheet(name);
    const viewport: SheetViewport = { id: `vp-${id}`, viewId, x: 200, y: 150, scale: 100, width: 0, height: 0, center: null };
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === id ? { ...x, viewports: [viewport] } : x)) }));
  }
  setProjectTitleBlockField('projectNumber', 'P-2026-014');
  setProjectTitleBlockField('drawnBy', 'D. Marin');
});
afterEach(() => cleanup());

/** The sheet as the app draws it, with `viewports` as given. */
function drawn(sheet: ProjectSheet, withDrawing: boolean): SVGSVGElement {
  const container = render(
    <SheetPaper sheet={withDrawing ? sheet : { ...sheet, viewports: [] }} projectName={useProjectStore.getState().name} content={() => ({ view: withDrawing ? view : undefined, drawing: withDrawing ? DRAWING : null, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  return container.querySelector('svg')!;
}

const titleTexts = (sheet: ProjectSheet): string[] => {
  const out = [...drawn(sheet, false).querySelectorAll('[data-title-block] text')].map((t) => t.textContent ?? '');
  cleanup();
  return out;
};
const screenCutWidths = (sheet: ProjectSheet): number[] => {
  const svg = sheetSvgText(drawn(sheet, true), sheet);
  cleanup();
  return [...new Set([...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path[data-dxf-layer="CUT"]')].map((p) => Number(p.getAttribute('stroke-width'))))].sort();
};

/** What `ifcsheet build --project` does with the saved file: the pens and the layout come from the file, through the engine's reader. */
function engineSheet(facts: ProjectFacts, sheet: ProjectSheet, withDrawing: boolean) {
  const s = useProjectStore.getState();
  const doc: EngineDocument = {
    name: s.name, models: [], views: s.views, sheets: s.sheets, titleBlock: effectiveTitleBlock(),
    ...(facts.titleBlockTemplate ? { titleBlockTemplate: facts.titleBlockTemplate } : {}), titleBlockParams: s.titleBlockParams,
  };
  const pens = facts.graphicStandard ?? undefined;
  const graphic = withDrawing
    ? sheetGraphic(sheet, doc, new Map([[view.id, DRAWING]]), undefined, new Map(), undefined, undefined, pens)
    : sheetGraphic({ ...sheet, viewports: [] }, doc, new Map(), undefined, new Map(), undefined, undefined, pens);
  return graphic;
}
const engineCutWidths = (facts: ProjectFacts, sheet: ProjectSheet): number[] => [...new Set(engineSheet(facts, sheet, true).pens.filter((p) => p.layer === 'CUT').map((p) => p.width))].sort();

const ro = (key: RoCaption): string => TITLE_BLOCK_CAPTIONS_RO[key];

describe('a project saved with the Romanian pack, built by the engine', () => {
  it('prints the same title block texts in the same order, and cuts with the same pen, as the sheet on screen', () => {
    installStandard(romaniaPack(ro));
    const facts = readProjectFile(serializeProject(projectDocument()));
    assert.equal(facts.graphicStandard?.id, 'ro-practice', 'the engine reads the graphic standard');
    assert.ok(facts.titleBlockTemplate && facts.titleBlockTemplate.items.length > 0, 'the engine reads the title block layout');
    for (const sheet of useProjectStore.getState().sheets) {
      // The scale is the one shared rule (sheetScaleLine): a dash for a sheet with no drawing, on screen and in the engine alike. Only an empty text differs (the engine leaves it out).
      const screen = titleTexts(sheet).filter((t) => t !== '');
      const engine = engineSheet(facts, sheet, false).texts.map((t) => t.text);
      assert.deepEqual(engine, screen, `${sheet.number} title block`);
      assert.ok(engine.includes('Proiectant general') && engine.includes('P-2026-014'));
      assert.deepEqual(screenCutWidths(sheet), [0.7], `${sheet.number} on screen`);
      assert.deepEqual(engineCutWidths(facts, sheet), [0.7], `${sheet.number} in the engine`);
    }
  });

  it('a project without a pack is built the way it always was, on screen and in the engine', () => {
    const facts = readProjectFile(serializeProject(projectDocument()));
    assert.equal(facts.graphicStandard, undefined);
    assert.equal(facts.titleBlockTemplate, undefined);
    for (const sheet of useProjectStore.getState().sheets) {
      const screen = titleTexts(sheet).filter((t) => t !== '');
      assert.deepEqual(engineSheet(facts, sheet, false).texts.map((t) => t.text), screen, `${sheet.number} title block`);
      assert.deepEqual(screenCutWidths(sheet), [PEN_TABLE.pens.cut]);
      assert.deepEqual(engineCutWidths(facts, sheet), [PEN_TABLE.pens.cut]);
    }
  });
});

describe('the engine\'s Romanian captions are the app\'s', () => {
  it('every caption of the Romanian layout reads the same in the app\'s Romanian catalogue', () => {
    const catalogue = { ...sheetsRo, ...titleBlockSourcesRo, ...titleBlockRoRo } as Record<string, string>;
    for (const [key, text] of Object.entries(TITLE_BLOCK_CAPTIONS_RO)) assert.equal(catalogue[key], text, key);
  });
});
