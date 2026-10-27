/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block values that do not fit their cell on a sheet (`titleBlockMisfits` in the engine), judged on the
 * lookup the sheet itself shows (`sheetParamLookup`), so the finding and the paper cannot disagree. The standard
 * layout wraps nothing and has no such finding; the Romanian one (F_01) does.
 */

import { sheetScaleLine, titleBlockMisfits, type TitleBlockMisfit, type TitleBlockTemplate } from '@bimvoice/ifcsheet';
import { notDrawingIds } from '@/project/drawing-register';
import type { ProjectSheet } from '@/project/types';
import { sheetParamLookup, type SheetParamContext } from '@/components/viewer/sheets/useSheetParams';

type Views = Parameters<typeof sheetScaleLine>[1];

export function sheetTitleBlockMisfits(template: TitleBlockTemplate | undefined, sheets: readonly ProjectSheet[], context: Omit<SheetParamContext, 'scale'> & { views: Views; asIndicated: string }): TitleBlockMisfit[] {
  if (!template) return [];
  const notDrawings = new Set(notDrawingIds(context.schedules));
  return titleBlockMisfits(template, sheets.map((sheet) => ({
    sheet: `${sheet.number} ${sheet.name}`.trim(),
    lookup: sheetParamLookup(sheet, { ...context, scale: sheetScaleLine(sheet, context.views, notDrawings, context.asIndicated) }),
  })));
}
