/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: the app's sheet DXF (the rendered SVG through `svgToDxf`) and the CLI's (`sheetGraphic` through the engine's `exportDxf`) put the
 * same TEXT in the file for the same sheet, one row per title block. Both paths are the real ones. The layers are not yet shared: the
 * app names them from the project's CAD rules (`TITLEBLOCK`), the engine writes `SHEET-TEXT`; that is what the second test pins.
 *
 * The rows hold letters windows-1252 has: ă, ș, ț are written by the app only once its writer escapes them (#617), and the engine's
 * own test (`sheet-export-dxf-text.test.ts`) holds that they are escapes there.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportDxf, sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { encodeDxfCp1252 } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { svgToDxf } from './sheet-dxf';

/** Both files are windows-1252 on disk: compare the bytes (read as Latin-1), not a decoder's idea of 0x80-0x9f. */
const appFile = (svg: SVGSVGElement) => new TextDecoder('latin1').decode(svgToDxf(svg, 297, 'parity', 1));
const cliFile = (dxf: string) => new TextDecoder('latin1').decode(encodeDxfCp1252(dxf).bytes);

/** The (layer, value) of every TEXT entity of a DXF text, from its group codes. */
function textsOf(dxf: string): { layer: string; value: string }[] {
  const lines = dxf.split(/\r?\n/);
  const out: { layer: string; value: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'TEXT') continue;
    let layer = '';
    let value = '';
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) {
      if (lines[j].trim() === '8') layer = lines[j + 1];
      if (lines[j].trim() === '1') value = lines[j + 1];
    }
    out.push({ layer, value });
  }
  return out;
}

const ROWS: { name: string; project: string; sheetName: string; fields: Record<string, string> }[] = [
  { name: 'plain ASCII', project: 'House', sheetName: 'Ground floor', fields: { project: 'House', client: 'Acme' } },
  { name: 'windows-1252 letters', project: 'Casa Î', sheetName: 'Etaj Î â', fields: { project: 'Casa Î â', client: 'Façade é' } },
  { name: 'German', project: 'Haus', sheetName: 'Erdgeschoss', fields: { project: 'Haus Äöü', address: 'Straße 1' } },
];

describe('the sheet DXF: app and CLI write the same text', () => {
  beforeEach(() => resetProject());
  afterEach(() => cleanup());

  for (const row of ROWS) {
    it(`${row.name}: the same TEXT values`, () => {
      const sheet: ProjectSheet = { id: 's1', number: 'A-101', name: row.sheetName, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [] };
      useProjectStore.setState({ sheets: [sheet], titleBlock: row.fields });
      const ui = render(<SheetPaper sheet={sheet} projectName={row.project} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [] })} />);
      const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
      assert.ok(svg, 'the sheet draws');
      const app = textsOf(appFile(svg)).map((t) => t.value).sort();
      const doc = { name: row.project, models: [], sheets: [sheet], views: [], titleBlock: row.fields };
      const cli = textsOf(cliFile(exportDxf(sheetGraphic(sheet, doc, new Map())))).map((t) => t.value).sort();
      assert.ok(app.length > 3, `the app writes the title block's text (${app.length})`);
      assert.ok(cli.length > 3, `the CLI writes the title block's text (${cli.length})`);
      assert.deepEqual(cli, app);
    });
  }

  it('names its text layers differently, which is the open half of #619', () => {
    const sheet: ProjectSheet = { id: 's1', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [] };
    useProjectStore.setState({ sheets: [sheet], titleBlock: { project: 'House' } });
    const ui = render(<SheetPaper sheet={sheet} projectName="House" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [] })} />);
    const svg = ui.querySelector('svg') as unknown as SVGSVGElement;
    const layers = (dxf: string) => [...new Set(textsOf(dxf).map((t) => t.layer))];
    assert.deepEqual(layers(appFile(svg)), ['TITLEBLOCK']);
    assert.deepEqual(layers(cliFile(exportDxf(sheetGraphic(sheet, { name: 'House', models: [], sheets: [sheet], views: [], titleBlock: { project: 'House' } }, new Map())))), ['SHEET-TEXT']);
  });
});
