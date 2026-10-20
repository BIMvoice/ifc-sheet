/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The quantities by type as an Excel workbook: the CSV's lines, numbers as numbers. */

import { neutralizeSpreadsheetFormula } from '@/lib/lists/export/model';
import { XLSX_MIME } from './schedule-xlsx';
import { typeQuantityLines, type TypeQuantityLabels } from './type-quantities-layout';
import type { TypeQuantities } from './type-quantities';

const text = (v: string) => neutralizeSpreadsheetFormula(v);

export async function typeQuantitiesXlsx(data: TypeQuantities, labels: TypeQuantityLabels): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IFC-Lite';
  const ws = wb.addWorksheet(labels.title.slice(0, 31) || 'Quantities', { views: [{ state: 'frozen', ySplit: 2 }] });
  const header = [labels.type, labels.class, labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto];
  ws.addRow([text(labels.title)]);
  ws.mergeCells(1, 1, 1, header.length);
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  const h = ws.addRow(header.map(text));
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; });
  header.forEach((label, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.min(40, label.length + 4));
    if (i >= 3) col.alignment = { horizontal: 'right' };
  });
  for (const l of typeQuantityLines(data, labels)) {
    const row = ws.addRow([text(l.type), text(l.className), text(l.level), l.totals.count, l.totals.length, l.totals.area, l.totals.volume, l.totals.noQto]);
    if (l.total) row.font = { bold: true };
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME });
}
