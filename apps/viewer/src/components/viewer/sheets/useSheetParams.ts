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
import { inSetOrder, notDrawingIds } from '@/project/drawing-register';
import { useProjectStore } from '@/project/project-store';
import { titleBlockOf } from '@/project/title-block';
import { useEffectiveTitleBlock } from '@/project/title-block-model';
import { fieldBuiltins, sheetScaleLine } from '@bimvoice/ifcsheet';
import { paramLookup } from '@/project/title-block-params';
import { currentRevisionOf } from '@/project/revisions';
import type { ProjectSheet } from '@/project/types';

/** The scale the sheet states: a sheet of schedules and tables only has none, and a perspective has none to state. */
export function useSheetScaleText(sheet: ProjectSheet): string {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules);
  const views = useProjectStore((s) => s.views);
  return sheetScaleLine(sheet, views, new Set(notDrawingIds(schedules)), t('sheets.asIndicated'));
}

/** What the lookup of one sheet reads from the project; the hook below and the readiness check (`sheetTitleBlockMisfits`) both build it from here, so the check judges what the sheet shows. */
export interface SheetParamContext {
  projectFields: Record<string, string> | undefined;
  projectName: string;
  params: ReturnType<typeof useProjectStore.getState>['titleBlockParams'];
  sheets: ProjectSheet[];
  schedules: ReturnType<typeof useProjectStore.getState>['schedules'];
  revisions: ReturnType<typeof useProjectStore.getState>['revisions'];
  drafts: ReturnType<typeof useProjectStore.getState>['drafts'];
  scale: string;
  issueDate?: string;
  /** The interface language: the title block's dates are written as it writes them (`formatTitleBlockDate`, the engine's one formatter). */
  language?: string;
}

export function sheetParamLookup(sheet: ProjectSheet, c: SheetParamContext): (name: string) => string | undefined {
  const fields = titleBlockOf(sheet, c.projectFields, c.projectName);
  // An issue dates its sheets: its date is the sheet's date on the paper it issues.
  if (c.issueDate) fields.date = c.issueDate;
  const page = inSetOrder(c.sheets, c.schedules).findIndex((s) => s.id === sheet.id) + 1;
  return paramLookup(sheet, c.params, {
    ...fieldBuiltins(fields, c.language), // the title block fields, by the engine's one table (`FIELD_PARAMS`), so the PDF names them alike
    SheetNumber: sheet.number, SheetName: sheet.name, Scale: c.scale, Page: `${page}/${c.sheets.length}`,
    // The revision is never typed: it is the latest the sheet has (`revisions.ts`).
    Revision: currentRevisionOf(sheet, { revisions: c.revisions, drafts: c.drafts })?.code ?? '',
  });
}

export function useSheetParamLookup(sheet: ProjectSheet, projectName: string, issueDate?: string): (name: string) => string | undefined {
  const projectFields = useEffectiveTitleBlock();
  const params = useProjectStore((s) => s.titleBlockParams);
  const sheets = useProjectStore((s) => s.sheets);
  const schedules = useProjectStore((s) => s.schedules);
  const revisions = useProjectStore((s) => s.revisions);
  const drafts = useProjectStore((s) => s.drafts);
  const scale = useSheetScaleText(sheet);
  const { locale } = useTranslation();
  return useMemo(
    () => sheetParamLookup(sheet, { projectFields, projectName, params, sheets, schedules, revisions, drafts, scale, issueDate, language: locale }),
    [sheet, projectFields, projectName, params, sheets, schedules, scale, revisions, drafts, issueDate, locale],
  );
}
