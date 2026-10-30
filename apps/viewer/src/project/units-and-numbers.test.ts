/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #88: one project setting, "Units and numbers", changes every figure a sheet prints, through the one formatter. A comma
 * separator in an English project writes the comma on the urban sheet, a dimension, a level mark, a room label and a schedule; a
 * length unit of cm turns a dimension's 3500 into 350; the CSV keeps its points and the XLSX its numbers; the command line reads
 * the same setting from the same file; and a project that sets nothing prints what it printed.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetFormat, type SheetLocale, type UnitsAndNumbers } from '@bimvoice/ifcsheet/names';
import { readProjectFile } from '@bimvoice/ifcsheet/project';
import { dimensionLayout, formatLength, formatLevel } from '@/drafting/annotation';
import { formatDimension } from '@/drafting/styles';
import type { AnnotationShape } from '@/drafting/types';
import { formatValue, parseFormatSpec } from '@/labels/label-format';
import { ceilingHeightText } from '@/rcp/ceiling-tags';
import { formatDistance } from '@/components/viewer/tools/formatDistance';
import { formatArea } from '@/components/viewer/tools/computePolygonArea';
import { layoutTypeQuantities, typeQuantityTable, type TypeQuantityLabels } from '@/joinery/type-quantities-layout';
import { layoutMaterialTakeoff } from '@/joinery/material-takeoff-layout';
import { layoutRoomFinishes, type RoomFinishLabels, roomFinishes } from '@bimvoice/ifcsheet';
import type { TypeQuantities } from '@/joinery/type-quantities';
import { csvDelimiter, exportCsv, exportXlsx } from '@/joinery/schedule-export';
import { layoutUrban, type UrbanLabels } from '@/urban/urban-layout';
import type { UrbanIndicators } from '@/urban/indicators';
import { currentSheetLocale } from './units-and-numbers';
import { parseProjectFile, serializeProject } from './project-file';
import { projectDocument, resetProject, setUnitsAndNumbers, useProjectStore } from './project-store';

const COMMA: SheetLocale = sheetFormat('en', { separator: 'comma' });
const textsOf = (prims: readonly { kind: string; text?: string }[]) => prims.flatMap((p) => (p.kind === 'text' && p.text !== undefined ? [p.text] : []));

const RESULT: UrbanIndicators = {
  storeys: [{ name: 'Ground', elevation: 2.7, height: 2.7, builtArea: 1234.5, usefulArea: 96, belowGround: false, ground: true, inCut: true, inCutByDefault: true, unmeasured: 0 }],
  ac: 120, ad: 240, adCut: 238.5, acAtLeast: false, adAtLeast: false, adCutAtLeast: false,
  au: 195.25, auNoStorey: null, auByCategory: [], siteArea: 600, pot: 20, cut: 0.4, terrainLevel: 0, zero: { elevation: 0, source: 'model' },
};
const URBAN_LABELS = (locale: SheetLocale): UrbanLabels => ({
  locale, title: 'T', level: 'Level', elevation: 'Elevation', built: 'Built', useful: 'Useful', inCut: 'In CUT', yes: 'yes', no: 'no',
  belowGround: (n) => n, ground: (n) => n, category: 'Category', area: 'Area',
  ac: 'Ac', ad: 'Ad', adCut: 'Ad for CUT', au: 'Au', site: 'Site', pot: 'POT', cut: 'CUT', rules: () => [], note: '',
  atLeast: (v) => `>= ${v}`, unmeasured: () => '',
});
const TQ = {
  levels: ['EG'],
  rows: [{ typeName: 'W1', className: 'IfcWall', byLevel: { EG: { count: 2, length: 12.5, area: 1234.5, volume: 3.25, noQto: 0 } }, total: { count: 2, length: 12.5, area: 1234.5, volume: 3.25, noQto: 0 } }],
  classTotals: [],
} as unknown as TypeQuantities;
const TQ_LABELS = (locale: SheetLocale): TypeQuantityLabels => ({
  locale, title: 'T', type: 'Type', class: 'Class', level: 'Level', count: 'Count', length: 'Length', area: 'Area', volume: 'Volume', noQto: 'None', total: 'Total', noType: 'no type', noLevel: 'no level', classification: 'Classification', classificationTitle: 'Title', unclassified: 'No classification',
});
const DIM: Extract<AnnotationShape, { type: 'dimension' }> = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 3.5, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 };

describe('a comma separator in an English project (#88)', () => {
  it('the urban sheet', () => {
    const texts = textsOf(layoutUrban(RESULT, URBAN_LABELS(COMMA)).prims);
    for (const figure of ['120,00', '240,00', '600,00', '20,00 %', '0,40', '+2,70', '1.234,50']) assert.ok(texts.includes(figure), `${figure} in ${texts.join(' | ')}`);
    assert.deepEqual(texts.filter((t) => /\d\.\d{2}\b/.test(t) && !/\d,\d{3}\.\d/.test(t)), []);
  });

  it('a dimension and a level mark', () => {
    assert.equal(formatDimension(COMMA, 3.25, { unit: 'm', precision: 2 }), '3,25');
    assert.equal(dimensionLayout(DIM, { format: (m) => formatDimension(COMMA, m, { unit: 'm', precision: 2 }), locale: COMMA }).label, '3,50');
    assert.equal(dimensionLayout(DIM, { locale: COMMA }).label, '3,50');
    assert.equal(formatLevel(COMMA, 2.7), '+2,70');
    assert.equal(formatLevel(COMMA, -1.5), '−1,50');
    assert.equal(ceilingHeightText(2.7, COMMA), '+2,70');
  });

  it('a room label', () => {
    assert.equal(formatValue(12.3456, parseFormatSpec('0.00 m²'), COMMA), '12,35 m²');
    assert.equal(formatValue(2.5, undefined, COMMA), '2,5');
  });

  it('a schedule', () => {
    const texts = textsOf(layoutTypeQuantities(TQ, TQ_LABELS(COMMA)).prims);
    for (const figure of ['12,50', '1.234,50', '3,25']) assert.ok(texts.includes(figure), `${figure} in ${texts.join(' | ')}`);
    const rows = [{ material: 'Beton', elements: 3, volume: 12.5, area: 1234.5, classes: ['IfcWall'] }];
    const labels = { locale: COMMA, title: 'T', material: 'M', elements: 'E', volume: 'V', area: 'A', usedIn: 'U', total: 'Tot' };
    assert.ok(textsOf(layoutMaterialTakeoff(rows, labels).prims).includes('1.234,50'));
    const rooms = roomFinishes([{ number: '101', name: 'Living', level: 'EG', elevation: 0, covers: [{ id: 'm#1', name: 'Parquet', predefinedType: 'FLOORING', area: 24.5 }], boundary: [], contained: [], properties: {} }]);
    const fin: RoomFinishLabels = { locale: COMMA, title: 'T', number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'Area', sharedNote: '*' };
    assert.ok(textsOf(layoutRoomFinishes(rooms, fin).prims).includes('24,50'));
  });

  it('a measure label and an area', () => {
    assert.equal(formatDistance(3.5, {}, sheetFormat('en', { separator: 'comma' })), '3,500 m');
    assert.equal(formatArea(12.5, COMMA), '12,50 m²');
  });
});

describe('the length unit and the decimals (#88)', () => {
  const STYLE = { unit: 'mm', precision: 0 } as const;
  it('cm turns a dimension\'s 3500 into 350', () => {
    assert.equal(formatDimension('en', 3.5, STYLE), '3500');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'cm' }), 3.5, STYLE), '350');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'm', decimals: { length: 2 } }), 3.5, STYLE), '3.50');
    assert.equal(dimensionLayout(DIM, { format: (m) => formatDimension(sheetFormat('en', { lengthUnit: 'cm' }), m, STYLE) }).label, '350');
  });

  it('a unit that is not the style\'s brings that unit\'s natural decimals; an explicit choice wins; no change keeps the style\'s', () => {
    const METRES = { unit: 'm', precision: 2 } as const;
    assert.equal(formatDimension('en', 11.48, METRES), '11.48');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'cm' }), 11.48, METRES), '1148');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'mm' }), 11.48, METRES), '11480');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'cm', separator: 'comma', decimals: { length: 1 } }), 11.48, METRES), '1148,0');
    // The style's own unit: its precision stands.
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'm' }), 11.48, { unit: 'm', precision: 3 }), '11.480');
    assert.equal(formatDimension(sheetFormat('en', { lengthUnit: 'mm' }), 11.48, { unit: 'mm', precision: 1 }), '11480.0');
    assert.equal(formatDimension(sheetFormat('en', { separator: 'comma' }), 11.48, METRES), '11,48');
  });

  it('the default dimension and a measure label follow the unit too', () => {
    assert.equal(formatLength('en', 3.5), '3.50');
    assert.equal(formatLength(sheetFormat('en', { lengthUnit: 'cm' }), 3.5), '350');
    assert.equal(formatDistance(3.5, {}, sheetFormat('en', { lengthUnit: 'cm' })), '350 cm');
  });

  it('decimals by kind reach the sheet\'s figures', () => {
    const f = sheetFormat('en', { decimals: { area: 1, volume: 3, length: 1, level: 3 } });
    const texts = textsOf(layoutTypeQuantities(TQ, TQ_LABELS(f)).prims);
    for (const figure of ['12.5', '1,234.5', '3.250']) assert.ok(texts.includes(figure), `${figure} in ${texts.join(' | ')}`);
    assert.equal(formatLevel(f, 2.7), '+2.700');
  });

  it('turning grouping off drops it from an area', () => {
    assert.ok(textsOf(layoutTypeQuantities(TQ, TQ_LABELS(sheetFormat('en', { group: false }))).prims).includes('1234.50'));
  });
});

describe('the exports (#88)', () => {
  const table = { name: 'Q', header: ['Type', 'Area', 'Volume'], rows: [['W1', 1234.5, 3.25]], numeric: [1, 2], kinds: { 1: 'area', 2: 'volume' } } as const;
  const data = { title: 'T', tables: [{ ...table, rows: [[...table.rows[0]]], kinds: { ...table.kinds } }] };

  it('the CSV keeps its points, and asks for a semicolon when the project writes a comma', () => {
    assert.match(exportCsv(data, { delimiter: csvDelimiter(COMMA) }), /W1;1234\.5;3\.25/);
    assert.equal(csvDelimiter(COMMA), ';');
    assert.equal(csvDelimiter('en'), ',');
    assert.equal(csvDelimiter(sheetFormat('ro', { separator: 'point' })), ',');
    assert.equal(csvDelimiter('ro'), ';');
    assert.equal(typeQuantityTableCsv(COMMA), typeQuantityTableCsv('en'));
  });

  async function cells(locale: SheetLocale | undefined) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await exportXlsx(data, locale === undefined ? {} : { locale })).arrayBuffer());
    const ws = wb.getWorksheet('Q')!;
    return [ws.getCell(3, 2), ws.getCell(3, 3)];
  }

  it('the XLSX keeps numeric cells and gives them the project\'s decimals', async () => {
    const [area, volume] = await cells(sheetFormat('en', { separator: 'comma', decimals: { area: 1, volume: 3 } }));
    assert.equal(area.value, 1234.5);
    assert.equal(volume.value, 3.25);
    assert.equal(area.numFmt, '#,##0.0');
    assert.equal(volume.numFmt, '#,##0.000');
    const [plain] = await cells(sheetFormat('en', { decimals: { area: 0 }, group: false }));
    assert.equal(plain.numFmt, '0');
  });

  it('a project that sets nothing writes the cells it always wrote', async () => {
    for (const locale of [undefined, 'ro', sheetFormat('ro', undefined), sheetFormat('en', { separator: 'comma' })]) {
      const [area, volume] = await cells(locale);
      assert.equal(area.numFmt ?? 'General', 'General');
      assert.equal(volume.numFmt ?? 'General', 'General');
    }
  });
});

const typeQuantityTableCsv = (locale: SheetLocale) => exportCsv({ title: 'T', tables: [typeQuantityTable(TQ, TQ_LABELS(locale))] });

describe('the same setting in the app and the engine (#88)', () => {
  const SETTING: UnitsAndNumbers = { lengthUnit: 'cm', decimals: { length: 1, area: 3, volume: 3, level: 3 }, separator: 'comma', group: false };
  beforeEach(() => resetProject());

  it('is stored in the project, and saved and loaded as it is', () => {
    setUnitsAndNumbers(SETTING);
    assert.deepEqual(useProjectStore.getState().unitsAndNumbers, SETTING);
    const text = serializeProject(projectDocument());
    assert.deepEqual(parseProjectFile(text).unitsAndNumbers, SETTING);
    assert.deepEqual(readProjectFile(text).unitsAndNumbers, SETTING);
  });

  it('the command line and the app write the same figures from the same file', () => {
    setUnitsAndNumbers(SETTING);
    const text = serializeProject(projectDocument());
    const engine = sheetFormat('en', readProjectFile(text).unitsAndNumbers);
    const app = sheetFormat('en', parseProjectFile(text).unitsAndNumbers);
    assert.deepEqual(engine, app);
    assert.equal(formatDimension(engine, 3.5, { unit: 'mm', precision: 0 }), '350,0');
    assert.deepEqual(textsOf(layoutTypeQuantities(TQ, TQ_LABELS(engine)).prims), textsOf(layoutTypeQuantities(TQ, TQ_LABELS(app)).prims));
  });

  it('a field that goes back to its default leaves the project as it was', () => {
    setUnitsAndNumbers({ separator: 'comma' });
    setUnitsAndNumbers({ separator: undefined });
    assert.equal(useProjectStore.getState().unitsAndNumbers, undefined);
    assert.equal('unitsAndNumbers' in JSON.parse(serializeProject(projectDocument())), false);
    assert.equal(currentSheetLocale('en'), 'en');
  });

  it('what the commands read is the open project\'s setting', () => {
    setUnitsAndNumbers({ separator: 'comma' });
    assert.deepEqual(currentSheetLocale('en'), { locale: 'en', separator: 'comma' });
  });
});

describe('a project that sets nothing prints what it printed (#88)', () => {
  it('every figure, in both languages', () => {
    for (const locale of ['en', 'ro']) {
      const same = sheetFormat(locale, {});
      assert.equal(same, locale);
      assert.deepEqual(textsOf(layoutUrban(RESULT, URBAN_LABELS(same)).prims), textsOf(layoutUrban(RESULT, URBAN_LABELS(locale)).prims));
    }
    assert.equal(formatDimension('ro', 3.2456, { unit: 'm', precision: 2 }), '3,25');
    assert.equal(formatLevel('ro', 3.06), '+3,06');
    const ro = textsOf(layoutUrban(RESULT, URBAN_LABELS('ro')).prims);
    for (const figure of ['+2,70', '1.234,50', '96,00', '120,00', '240,00', '195,25', '600,00', '20,00 %']) assert.ok(ro.includes(figure), `${figure} in ${ro.join(' | ')}`);
  });
});
