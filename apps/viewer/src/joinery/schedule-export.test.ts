/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #80: the CSV and XLSX of every kind of schedule hold the table the sheet draws. Each kind is laid out (the drawn primitives) and
 * exported from the same input, and the drawn lines are read back and held against the exported rows: the same rows, in the same
 * order, a hidden row absent, a text row present, a figure a number. The formula guard and the Romanian diacritics are held on
 * the files themselves.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { addTextRow, setTextCell, type ScheduleContent, type ScheduleTextRow, takeoffRows, layoutMaterialTakeoff, takeoffTable } from '@bimvoice/ifcsheet';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { csvDelimiter, exportCsv, exportXlsx, scheduleFileName, type ExportCell, type ExportTable } from './schedule-export';
import { joineryExport, layoutSchedule, type ScheduleLabels } from './schedule-layout';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import { roomFinishes, type RoomInput, finishTable, layoutRoomFinishes } from '@bimvoice/ifcsheet';
import { typeQuantities, type TypeElement } from '@bimvoice/ifcsheet';
import { layoutTypeQuantities, typeQuantityTable } from '@bimvoice/ifcsheet';
import { layoutRegister, registerTable } from '@bimvoice/ifcsheet';
import { layoutUrban, urbanTable, type UrbanLabels } from '@/urban/urban-layout';
import type { UrbanIndicators } from '@/urban/indicators';
import { assertSameRows, csvLines, joineryLabels, shows, tableCsv, textsOf } from './export-test-util';

const TITLE = 'Schedule';

const csvOf = (table: ExportTable) => csvLines(tableCsv(table));

describe('a takeoff', () => {
  const rows = takeoffRows([
    { className: 'IfcWall', materials: [{ name: 'Concrete', share: 1 }], volume: 12.5, area: 1234.5 },
    { className: 'IfcSlab', materials: [{ name: 'Brick', share: 0.5 }, { name: 'Concrete', share: 0.5 }], volume: 3, area: null },
  ]);
  const labels = { locale: 'en', title: TITLE, material: 'Material', elements: 'Elements', volume: 'Volume m³', area: 'Area m²', usedIn: 'Used in', total: 'Total' };
  it('exports the rows and the total line the sheet draws', () => assertSameRows(layoutMaterialTakeoff(rows, labels), takeoffTable(rows, labels)));
  it('keeps figures as plain numbers in the CSV', () => assert.match(csvOf(takeoffTable(rows, labels))[1], /^Concrete,\d+,\d+(\.\d+)?,1234\.5,/));
});

describe('the room finishes', () => {
  const room = (over: Partial<RoomInput>): RoomInput => ({ number: '1', name: 'Room', level: 'L1', elevation: 0, covers: [], boundary: [], contained: [], properties: {}, ...over });
  const cov = (id: number, name: string, predefinedType: string, area: number | null) => ({ id: `m#${id}`, name, predefinedType, area });
  const labels = { locale: 'en', title: TITLE, number: 'No.', room: 'Room', level: 'Level', floor: 'Floor', wall: 'Wall', ceiling: 'Ceiling', area: 'Area m²', sharedNote: '* Shared by several rooms.' };
  const rooms = roomFinishes([
    room({ number: '101', name: 'Living', covers: [cov(1, 'Parquet', 'FLOORING', 24.5), cov(2, 'Paint', 'CLADDING', 52), cov(3, 'Veneer', 'CLADDING', 4.25)] }),
    room({ number: '102', name: 'Store', covers: [cov(4, 'Tile', 'FLOORING', 30)] }),
    room({ number: '103', name: 'Hall', covers: [cov(4, 'Tile', 'FLOORING', 30)] }),
  ]);
  it('exports the lines and the shared-area note the sheet draws', () => assertSameRows(layoutRoomFinishes(rooms, labels), finishTable(rooms, labels)));
});

describe('the quantities by type', () => {
  const el = (p: Partial<TypeElement>): TypeElement => ({ className: 'IfcWall', typeClass: 'IfcWallType', typeName: 'W1', level: 'L0', elevation: 0, length: null, area: null, volume: null, ...p });
  const labels = { locale: 'en', title: TITLE, type: 'Type', class: 'Class', level: 'Storey', count: 'Count', length: 'Length m', area: 'Area m²', volume: 'Volume m³', noQto: 'No Qto', total: 'Total', noType: '(no type)', noLevel: 'No storey', classification: 'Classification', classificationTitle: 'Title', unclassified: 'No classification' };
  const data = typeQuantities([el({ length: 1.5 }), el({ level: 'L1', elevation: 3, length: 2, area: 4 }), el({ className: 'IfcSlab', typeClass: null, typeName: null, area: 10 })]);
  it('exports every line, the totals in bold, the type on each line', () => {
    const table = typeQuantityTable(data, labels);
    assertSameRows(layoutTypeQuantities(data, labels), table);
    assert.ok((table.bold ?? []).length > 0);
  });
});

describe('the urban indicators', () => {
  const RESULT: UrbanIndicators = {
    storeys: [
      { name: 'Erdgeschoss', elevation: 0, height: 2.7, builtArea: 120, usefulArea: 99.25, belowGround: false, ground: true, inCut: true, inCutByDefault: true, unmeasured: 0 },
      { name: 'Keller', elevation: -2.4, height: 2.4, builtArea: 1234.5, usefulArea: null, belowGround: true, ground: false, inCut: false, inCutByDefault: false, unmeasured: 0 },
    ],
    ac: 120, ad: 240, adCut: 238.5, acAtLeast: true, adAtLeast: false, adCutAtLeast: false,
    au: 195.25, auNoStorey: null, auByCategory: [{ category: 'Flur', area: 12.5 }],
    siteArea: 600, pot: 20, cut: 0.4, terrainLevel: -1.5, zero: { elevation: 0, source: 'model' },
  };
  const labels: UrbanLabels = {
    locale: 'en', title: TITLE, level: 'Level', elevation: 'Elevation', built: 'Built', useful: 'Useful', inCut: 'In CUT', yes: 'yes', no: 'no',
    belowGround: (n) => `${n} (below ground)`, ground: (n) => `${n} (ground)`, category: 'Category', area: 'Area',
    ac: 'Ac', ad: 'Ad', adCut: 'Ad for CUT', au: 'Au', site: 'Site', pot: 'POT', cut: 'CUT', rules: () => ['Areas are measured at the outside.', 'CUT leaves out the cellar.'], note: '',
    atLeast: (v) => `>= ${v}`, unmeasured: (count, level) => `${count} unmeasured on ${level}`,
  };
  it('exports the blocks the sheet draws, a lower bound as text and the rules under them', () => {
    const table = urbanTable(RESULT, labels);
    assertSameRows(layoutUrban(RESULT, labels), table);
    assert.ok(table.rows.some((r) => r[1] === '>= 120'), 'a lower bound is not a bare number');
    assert.ok(table.rows.some((r) => r[0] === 'Ac' && r.length === 2));
  });
});

describe('the register', () => {
  const rows = [
    { number: 'A-101', title: 'Ground floor', scale: '1:50', revision: 'B', date: '2026-10-01' },
    { number: 'A-102', title: 'Sections, north', scale: '1:50, 1:100', revision: '', date: '' },
  ];
  const labels = { title: TITLE, number: 'Sheet', sheetTitle: 'Title', scale: 'Scale', revision: 'Rev.', date: 'Date' };
  it('exports every sheet of the set as the table draws it', () => assertSameRows(layoutRegister(rows, labels), registerTable(rows, labels)));
});

describe('a joinery schedule', () => {
  const labels: ScheduleLabels = { locale: 'en', title: TITLE, mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op };
  const entry = (i: number, over: Partial<ScheduleEntry> = {}): ScheduleEntry => {
    const door = i % 2 === 0;
    return {
      key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
      width: 0.9 + i / 10, height: door ? 2.1 : 1.5, counts: { Ground: 1 + i, 'Level 1': i % 2 }, total: 1 + i + (i % 2),
      occurrences: [{ modelId: 'm', expressId: i, globalId: `g${i}`, level: 'Ground', tag: null, number: 1 }], ...over,
    };
  };
  const text = (): ScheduleTextRow[] => {
    let rows = addTextRow(undefined, 'r1', 'Manufacturer');
    for (let i = 0; i < 4; i++) rows = setTextCell(rows, 'r1', `t${i}`, `Maker ${i}`, `T${i}`);
    return rows;
  };
  const data = (content?: ScheduleContent): ScheduleData => ({ levels: ['Ground', 'Level 1'], entries: [0, 1, 2, 3].map((i) => entry(i)), textRows: text(), ...(content ? { content } : {}) });

  /** The drawn table, a row per line of the label column, read against the exported columns: `Size` is two columns. */
  function assertSameJoinery(d: ScheduleData): ExportTable {
    const layout = layoutSchedule(d, labels);
    const table = joineryExport(d, joineryLabels(labels)).tables[0];
    const all = textsOf(layout);
    const marks = all.filter((t) => t.size === 4).sort((a, b) => a.x - b.x).map((t) => t.text);
    assert.deepEqual(table.rows.map((r) => r[0]), marks, 'the marks, in the order the cards stand');
    const lines = all.filter((t) => t.x === 2 && t.size !== 4).sort((a, b) => a.y - b.y).map((label) => ({
      label: label.text, cells: all.filter((t) => t.x > 2 && t.y >= label.y - 0.01 && t.y <= label.y + 0.6 && t.size !== 2).sort((a, b) => a.x - b.x).map((t) => t.text),
    })).filter((l) => l.label !== labels.mark);
    let col = 1;
    for (const line of lines) {
      const span = line.label === labels.size ? 2 : 1;
      if (span === 1) assert.equal(table.header[col], line.label, `column ${col} is the row ${line.label}`);
      table.rows.forEach((row, e) => {
        const cell = span === 2 ? `${row[col]} × ${row[col + 1]}` : row[col];
        assert.ok(shows(line.cells[e], cell as ExportCell), `${line.label} of ${row[0]}: the sheet draws ${JSON.stringify(line.cells[e])}, the file has ${JSON.stringify(cell)}`);
      });
      assert.equal(line.cells.length, table.rows.length);
      col += span;
    }
    assert.equal(col, table.header.length, 'the file has no column the sheet does not draw');
    return table;
  }

  it('exports the rows the sheet draws, with the text row', () => {
    const table = assertSameJoinery(data());
    assert.ok(table.header.includes('Manufacturer'));
    assert.equal(table.rows[2][table.header.indexOf('Manufacturer')], 'Maker 2');
  });
  it('follows the choice of rows: a hidden row is not in the file, a moved one is where the sheet puts it', () => {
    const table = assertSameJoinery(data({ rows: { hidden: ['sill', 'fire', 'text:r1'] } }));
    for (const gone of ['Sill', 'Fire', 'Manufacturer']) assert.ok(!table.header.includes(gone), gone);
    assertSameJoinery(data({ rows: { order: ['total', 'name', 'size', 'levels'] } }));
  });
  it('follows the order and the marks of the entries it is given (the engine sorts and numbers them: `scheduleOf`)', () => {
    const reversed = { ...data(), entries: data().entries.map((e, i) => ({ ...e, mark: `${e.kind === 'door' ? 'D' : 'W'}${10 - i}` })).reverse() };
    const table = assertSameJoinery(reversed);
    assert.deepEqual(table.rows.map((r) => r[0]), ['W7', 'D8', 'W9', 'D10']);
  });
  it('keeps figures as numbers, empty where the sheet draws nothing, and adds a total line the sheet does not draw', () => {
    const { tables } = joineryExport(data(), joineryLabels(labels));
    const [types] = tables;
    assert.equal(typeof types.rows[0][2], 'number');
    assert.equal(types.rows[0][types.header.indexOf('Sill')], null, 'a door has no sill');
    assert.equal(types.footer?.[0]?.[0], 'Total');
    assert.equal(types.footer?.[0]?.[types.header.indexOf('Total')], types.rows.reduce((s, r) => s + (r[types.header.indexOf('Total')] as number), 0));
    assert.equal(tables[1].workbookOnly, true, 'the Elements sheet is in the workbook only');
    assert.equal(csvLines(exportCsv(joineryExport(data(), joineryLabels(labels)))).length, 1 + 4 + 1, 'header, four types, the total; nothing of the Elements sheet');
  });
});

describe('the CSV', () => {
  const table = (...cells: ExportCell[]): ExportTable => ({ name: 'T', header: ['A'], rows: [cells] });
  it('neutralises a cell a spreadsheet would run as a formula: = + - @ tab and carriage return, also behind an invisible character', () => {
    for (const hostile of ['=HYPERLINK("x")', '+cmd|x', '-cmd|x', '@SUM(A1)', '\t=1', '\r=1', '​=1+1', '-007', '+41791234567']) {
      const line = csvLines(tableCsv({ name: 'T', header: ['A'], rows: [[hostile]] }))[1];
      const cell = line.startsWith('"') ? line.slice(1, -1).replace(/""/g, '"') : line;
      assert.ok(cell.startsWith("'"), `${JSON.stringify(hostile)} is guarded: ${JSON.stringify(line)}`);
    }
  });
  it('leaves a figure a figure: a negative number is not guarded, so it still sums', () => {
    assert.equal(csvLines(tableCsv(table(-3.5, 1234.5, 0)))[1], '-3.5,1234.5,0');
  });
  it('is UTF-8 with a byte order mark, so Romanian diacritics survive Excel, and CRLF', () => {
    const csv = tableCsv(table('Ușă încăpere țeavă Ștefan Ăă Îî Ââ'));
    assert.ok(csv.startsWith('﻿'));
    assert.ok(csv.includes('Ușă încăpere țeavă Ștefan Ăă Îî Ââ'));
    assert.ok(csv.endsWith('\r\n') && csv.includes('A\r\n'));
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(csv)).replace(/^﻿/, ''), csv.slice(1));
  });
  it('quotes the delimiter, and picks `;` for a language whose decimal mark is a comma', () => {
    assert.equal(csvDelimiter('ro'), ';');
    assert.equal(csvDelimiter('de'), ';');
    assert.equal(csvDelimiter('en'), ',');
    assert.equal(csvLines(tableCsv(table('a;b', 'c,d'), 'T', ';'))[1], '"a;b";c,d');
  });
  it('writes the figures with a point whatever the language is', () => {
    assert.equal(sheetNumber('ro', 1234.5), '1.234,50');
    assert.equal(csvLines(tableCsv(table(1234.5), 'T', ';'))[1], '1234.5');
  });
});

describe('the XLSX', () => {
  async function sheets(table: ExportTable[]) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await exportXlsx({ title: 'Tabel de tâmplărie', tables: table })).arrayBuffer());
    return wb;
  }
  it('keeps figures as numeric cells and Romanian diacritics intact, the title over the table', async () => {
    const wb = await sheets([{ name: 'Uși și ferestre', header: ['Poziție', 'Lățime (mm)', 'Înălțime (mm)'], rows: [['Ușă ț', 900, 2100.5], ['Total', null, 3]], numeric: [1, 2] }]);
    const ws = wb.getWorksheet('Uși și ferestre')!;
    assert.equal(ws.getCell(1, 1).value, 'Tabel de tâmplărie');
    assert.deepEqual([1, 2, 3].map((c) => ws.getCell(2, c).value), ['Poziție', 'Lățime (mm)', 'Înălțime (mm)']);
    assert.equal(ws.getCell(3, 1).value, 'Ușă ț');
    assert.equal(typeof ws.getCell(3, 2).value, 'number');
    assert.equal(ws.getCell(3, 3).value, 2100.5);
    assert.equal(ws.getCell(4, 2).value, null);
  });
  it('guards a cell a spreadsheet would run, and writes the footer and the notes', async () => {
    const wb = await sheets([{ name: 'T', header: ['A', 'B'], rows: [['=HYPERLINK("x")', -2]], footer: [['Total', -2]], notes: ['A note'] }]);
    const ws = wb.getWorksheet('T')!;
    assert.equal(ws.getCell(3, 1).value, `'=HYPERLINK("x")`);
    assert.equal(ws.getCell(3, 2).value, -2);
    assert.equal(ws.getCell(4, 1).value, 'Total');
    assert.equal(ws.getCell(5, 1).value, 'A note');
  });
  it('writes a joinery schedule as the Types and the Elements sheets', async () => {
    const labels: ScheduleLabels = { locale: 'en', title: TITLE, mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op };
    const d: ScheduleData = { levels: ['G'], entries: [{ key: 'k', kind: 'door', spec: defaultDoorSpec('D'), mark: 'D1', name: 'Ușă', width: 0.9, height: 2.1, counts: { G: 2 }, total: 2, occurrences: [{ modelId: 'm', expressId: 1, globalId: 'g1', level: 'G', tag: null, number: 1 }] }] };
    const wb = await sheets(joineryExport(d, joineryLabels(labels)).tables);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Types', 'Elements']);
    assert.equal(wb.getWorksheet('Elements')!.getCell(3, 3).value, 'Ușă');
    assert.equal(wb.getWorksheet('Elements')!.getCell(3, 4).value, 900);
  });
});

describe('the file name', () => {
  it('keeps the name as typed, letters of any script included, and makes what a file cannot hold safe', () => {
    assert.equal(scheduleFileName('Tabel uși/ferestre', 'tabel', 'xlsx'), 'Tabel uși-ferestre.xlsx');
    assert.equal(scheduleFileName('', 'tabel', 'csv'), 'tabel.csv');
    assert.equal(scheduleFileName('///', 'schedule', 'csv'), 'schedule.csv');
  });
});
