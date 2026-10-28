/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities in the app, on AC20-FZK-Haus (#75): the table edited through the app's actions, the sum the app reads equal to the
 * engine's (the command line's), the XLSX it writes (Romanian headings, figures as numeric cells), and the summary on a sheet. The FZK-Haus
 * DECLARES its wall quantities (Qto_WallBaseQuantities): the 5 walls of the type "Leichtbeton 102890359 240" hold 13.1326698911 m3 of NetVolume.
 * The article codes are EXAMPLES made up for the test: IfcSheet ships no norm or article code.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { boqPropertyNames, computeBoq } from '@bimvoice/ifcsheet';
import { readBoqElements, storeSource } from '@bimvoice/ifcsheet/project';
import { cleanup, render } from '@/test/render.js';
import { parseStep } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addScheduleToSet } from '@/project/drawing-set-actions';
import { exportCsv, exportXlsx } from '@/joinery/schedule-export';
import { addBoqArticle, setBoqDetail, setBoqUnit, updateBoqArticle } from '@/boq/boq-actions';
import { collectBoqElements } from '@/boq/boq-models';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { WallSheet } from '@/components/viewer/wall/WallSheet';
import { readScheduleExport, type ExportLabelSet } from '@/components/viewer/wall/schedule-export-read';
import { sheetSvgText } from '@/components/viewer/sheets/sheet-export';
import { boqSayFor } from '@bimvoice/ifcsheet';

const TYPE_240 = 'Leichtbeton 102890359 240';
const SUM_240 = 13.132669891109998;

async function openFzk() {
  const store = await parseStep(new Uint8Array(readFileSync(new URL('../test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([['fzk', { id: 'fzk', name: 'fzk', ifcDataStore: store, visible: true } as never]]) });
  return store;
}

/** The labels an export reads, with only the words of the bill of quantities filled in: the others are not read by a `boq` schedule. */
const labels = (locale: string): ExportLabelSet => ({ boq: boqSayFor(locale) } as unknown as ExportLabelSet);

/** An EXAMPLE article through the app's own actions: the walls of one type, NetVolume x 1, in m3. */
function mapWalls(): string {
  const id = addBoqArticle('m3');
  updateBoqArticle(id, { code: 'EXAMPLE-ZID-01', description: 'EXEMPLU: zidărie, tip T240', typeName: TYPE_240 });
  return id;
}

beforeEach(() => { resetProject(); setLocale('en'); });
afterEach(() => { cleanup(); setLocale('en'); });

describe('the app and the engine read the same bill of quantities', () => {
  it('reads the same elements and gives the same sums, with a property filter, through the list provider and through the store', async () => {
    const store = await openFzk();
    const id = mapWalls();
    updateBoqArticle(id, { filter: { classes: ['IfcWall'], properties: [{ name: 'Ebene', op: 'equals', value: 'Innenwände' }] } });
    const door = addBoqArticle('m3');
    updateBoqArticle(door, { code: 'EXAMPLE-DOOR', description: 'EXAMPLE: doors', filter: { classes: ['IfcDoor'] } });
    const articles = useProjectStore.getState().boqArticles ?? [];
    const names = new Set(boqPropertyNames(articles));
    const app = collectBoqElements(names);
    const engine = readBoqElements(storeSource('fzk', store), names);
    assert.equal(app.length, 82);
    assert.deepEqual(app, engine, 'the same elements');
    const result = computeBoq(app, articles);
    assert.deepEqual(result, computeBoq(engine, articles));
    assert.ok(Math.abs(result.lines[0].total! - SUM_240) < 1e-9, `${result.lines[0].total}`);
    assert.equal(result.lines[1].missing.length, 5, 'the doors declare no NetVolume');
  });
});

describe('mapping the walls of one type to an article', () => {
  it('gives its total in the article\'s unit, saved with the project, and refuses the unit that is not the quantity\'s', async () => {
    await openFzk();
    const id = mapWalls();
    const sheetId = addScheduleToSet('boq', 'Antemăsurătoare');
    assert.ok(sheetId);
    const schedule = useProjectStore.getState().schedules!.find((s) => s.kind === 'boq')!;
    const data = await readScheduleExport(schedule, labels('en'));
    assert.ok(data);
    const row = data.tables[0].rows[0];
    assert.deepEqual(row.slice(0, 4), [1, 'EXAMPLE-ZID-01', 'EXEMPLU: zidărie, tip T240', 'm³']);
    assert.ok(Math.abs((row[4] as number) - SUM_240) < 1e-6);
    // A change of unit takes the quantity along when it no longer fits; a quantity typed by hand against another unit is refused in words.
    setBoqUnit(id, 'm2');
    assert.equal(useProjectStore.getState().boqArticles![0].quantity, 'NetSideArea');
    updateBoqArticle(id, { unit: 'm3' });
    const refused = (await readScheduleExport(schedule, labels('en')))!.tables[0];
    assert.equal(refused.rows[0][4], null);
    assert.match(refused.notes!.join(' '), /EXAMPLE-ZID-01: NetSideArea gives m², not m³/);
  });

  it('writes an XLSX with Romanian headings, codes, descriptions, units, and the quantities as numeric cells', async () => {
    await openFzk();
    mapWalls();
    const door = addBoqArticle('m3');
    updateBoqArticle(door, { code: 'EXAMPLE-DOOR', description: 'EXEMPLU: uși', filter: { classes: ['IfcDoor'] } });
    addScheduleToSet('boq', 'Antemăsurătoare');
    const schedule = useProjectStore.getState().schedules!.find((s) => s.kind === 'boq')!;
    setBoqDetail(schedule.id, true);
    const data = await readScheduleExport(useProjectStore.getState().schedules!.find((s) => s.kind === 'boq')!, labels('ro'));
    assert.ok(data);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await exportXlsx(data)).arrayBuffer());
    const ws = wb.worksheets[0];
    const cell = (r: number, c: number) => ws.getCell(r, c).value;
    assert.deepEqual([1, 2, 3, 4, 5].map((c) => cell(2, c)), ['Nr. crt.', 'Cod articol', 'Denumire', 'U.M.', 'Cantitate']);
    assert.deepEqual([1, 2, 3, 4].map((c) => cell(3, c)), [1, 'EXAMPLE-ZID-01', 'EXEMPLU: zidărie, tip T240', 'm³']);
    assert.equal(typeof cell(3, 1), 'number');
    assert.equal(typeof cell(3, 5), 'number');
    assert.ok(Math.abs((cell(3, 5) as number) - SUM_240) < 1e-6);
    assert.equal(cell(4, 3), `  ${TYPE_240}`, 'a row per type under the article');
    assert.equal(typeof cell(4, 5), 'number');
    // The article whose elements declare no NetVolume has no quantity (empty, not zero), and the file says so.
    assert.equal(cell(5, 5), null);
    const lines: unknown[] = [];
    ws.eachRow((row) => lines.push(row.getCell(1).value));
    assert.ok(lines.some((v) => typeof v === 'string' && v.includes('EXAMPLE-DOOR: 5 elemente corespund, dar niciunul nu declară NetVolume')), 'the note is in the file');
    // The CSV is the same table: plain numbers.
    assert.match(exportCsv(data, { delimiter: ';' }), /1;EXAMPLE-ZID-01;EXEMPLU: zidărie, tip T240;m³;13\.13267/);
  });
});

describe('the summary on a sheet', () => {
  it('prints the articles in Romanian with the figure written the Romanian way, and follows an edit of the table', async () => {
    await openFzk();
    registerLocale('ro', checkCatalogue(ro).catalogue);
    startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
    mapWalls();
    const sheetId = addScheduleToSet('boq', 'Antemăsurătoare');
    act(() => setLocale('ro'));
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId)!;
    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    const svg = ui.querySelector<SVGSVGElement>(`svg[data-sheet-id="${sheet.id}"]`);
    assert.ok(svg, 'the sheet is drawn');
    const text = sheetSvgText(svg, sheet);
    for (const word of ['Nr. crt.', 'Cod articol', 'Denumire', 'U.M.', 'Cantitate', 'EXAMPLE-ZID-01', 'm³', '13,13']) assert.ok(text.includes(`>${word}<`), `${word} on the sheet`);
    assert.ok(text.includes('>Antemăsurătoare<'));
    // An edit of the table is on the sheet at once: a factor of 2 and a waste of 10 % make 28,89.
    act(() => updateBoqArticle(useProjectStore.getState().boqArticles![0].id, { factor: 2, waste: 10 }));
    assert.ok(sheetSvgText(svg, sheet).includes('>28,89<'));
  });
});
