/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The room finishes as an Excel workbook: the CSV's lines, areas as numbers. */

import { neutralizeSpreadsheetFormula } from '@/lib/lists/export/model';
import { XLSX_MIME } from './schedule-xlsx';
import { finishHeader, finishRows, type RoomFinishLabels } from './room-finishes-layout';
import { hasSharedFinish, type RoomFinishes } from './room-finishes';

const text = (v: string) => neutralizeSpreadsheetFormula(v);

export async function roomFinishesXlsx(rooms: readonly RoomFinishes[], labels: RoomFinishLabels): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IFC-Lite';
  const ws = wb.addWorksheet(labels.title.slice(0, 31) || 'Finishes', { views: [{ state: 'frozen', ySplit: 2 }] });
  const header = finishHeader(labels);
  ws.addRow([text(labels.title)]);
  ws.mergeCells(1, 1, 1, header.length);
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  const h = ws.addRow(header.map(text));
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; });
  header.forEach((label, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.min(40, label.length + 4));
    if (i >= 3 && i % 2 === 0) col.alignment = { horizontal: 'right' };
  });
  for (const r of finishRows(rooms)) ws.addRow(r.map((v) => (typeof v === 'string' ? text(v) : v)));
  if (hasSharedFinish(rooms)) ws.addRow([text(labels.sharedNote.replace(/^\*\s*/, ''))]);
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME });
}
