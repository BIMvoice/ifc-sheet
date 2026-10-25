/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What `{Name}` means on one sheet (#143): the built-ins from the sheet and
 * its title block fields, the user's parameters with the sheet's own values
 * on top (`title-block-params.ts`). The title block's layout and the sheet's
 * parametric texts both read through the one lookup, so they cannot disagree.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { inSetOrder, notDrawingIds, sheetScaleText } from '@/project/drawing-register';
import { useProjectStore } from '@/project/project-store';
import { hasTrueScale } from '@/project/axonometric';
import { titleBlockOf } from '@/project/title-block';
import { useEffectiveTitleBlock } from '@/project/title-block-model';
import { fieldBuiltins } from '@bimvoice/ifcsheet';
import { paramLookup } from '@/project/title-block-params';
import { currentRevisionOf } from '@/project/revisions';
import type { ProjectSheet } from '@/project/types';

/** The scale the sheet states: a sheet of schedules and tables only has none, and a perspective has none to state. */
export function useSheetScaleText(sheet: ProjectSheet): string {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules);
  const views = useProjectStore((s) => s.views);
  const unscaled = new Set(notDrawingIds(schedules));
  for (const v of sheet.viewports ?? []) if (!hasTrueScale(views.find((x) => x.id === v.viewId))) unscaled.add(v.viewId);
  return sheetScaleText(sheet, unscaled, t('sheets.asIndicated')) || '\u2014';
}

export function useSheetParamLookup(sheet: ProjectSheet, projectName: string): (name: string) => string | undefined {
  const projectFields = useEffectiveTitleBlock();
  const params = useProjectStore((s) => s.titleBlockParams);
  const sheets = useProjectStore((s) => s.sheets);
  const schedules = useProjectStore((s) => s.schedules);
  const revisions = useProjectStore((s) => s.revisions);
  const drafts = useProjectStore((s) => s.drafts);
  const scale = useSheetScaleText(sheet);
  return useMemo(() => {
    const fields = titleBlockOf(sheet, projectFields, projectName);
    const page = inSetOrder(sheets, schedules).findIndex((s) => s.id === sheet.id) + 1;
    return paramLookup(sheet, params, {
      ...fieldBuiltins(fields), // the title block fields, by the engine's one table (`FIELD_PARAMS`), so the PDF names them alike
      SheetNumber: sheet.number, SheetName: sheet.name, Scale: scale, Page: `${page}/${sheets.length}`,
      // The revision is never typed: it is the latest the sheet has (`revisions.ts`).
      Revision: currentRevisionOf(sheet, { revisions, drafts })?.code ?? '',
    });
  }, [sheet, projectFields, projectName, params, sheets, schedules, scale, revisions, drafts]);
}
