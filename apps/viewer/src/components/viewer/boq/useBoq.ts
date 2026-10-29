/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities as the screen reads it (#75): the elements of the loaded models and the articles' sums, read again only when the models,
 * an edit or the articles change; the words in the interface's language; and the layouts of the summaries placed on a sheet. The sum is the
 * engine's `computeBoq`, the same function the command line runs.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { boqPropertyNames, computeBoq, type BoqArticle, type BoqElement, type BoqResult, type BoqSay } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useSheetLocale } from '@/project/units-and-numbers';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule, ProjectSheet } from '@/project/types';
import { collectBoqElements } from '@/boq/boq-models';
import { layoutBoq } from '@bimvoice/ifcsheet';
import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { layoutTableOnSheet, syncSchedulePages } from '@/project/schedule-fit';

const NO_ARTICLES: BoqArticle[] = [];
const NO_ELEMENTS: BoqElement[] = [];
const NO_RESULT: BoqResult = { lines: [] };

/** The words of the table and its refusals, in the interface's language. */
export function useBoqSay(): BoqSay {
  const { t } = useTranslation();
  return useCallback<BoqSay>((key, params) => t(key, params), [t]);
}

/** The project's articles (stable while they do not change). */
export const useBoqArticles = (): BoqArticle[] => useProjectStore((s) => s.boqArticles) ?? NO_ARTICLES;

/**
 * The models' elements, read again when a model or an edit changes or when the properties the articles' filters name do; not when only a
 * code or a factor is typed. `enabled` false reads nothing (a sheet without the summary).
 */
export function useBoqElements(enabled = true): BoqElement[] {
  const articles = useBoqArticles();
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const properties = boqPropertyNames(articles).join('|');
  // models / mutationVersion: what `collectBoqElements` reads.
  return useMemo(() => (enabled ? collectBoqElements(new Set(properties ? properties.split('|') : [])) : NO_ELEMENTS), [enabled, models, mutationVersion, properties]);
}

/** Every article's sum over the loaded models. */
export function useBoqResult(enabled = true): BoqResult {
  const articles = useBoqArticles();
  const elements = useBoqElements(enabled);
  return useMemo(() => (enabled ? computeBoq(elements, articles) : NO_RESULT), [enabled, elements, articles]);
}

/** The layouts of the bill-of-quantities summaries placed on `sheet`, by schedule id, and the sheets that follow when one runs over several. */
export function useBoqSheetLayouts(sheet: ProjectSheet): Map<string, ScheduleLayout> {
  const schedules = useProjectStore((s) => s.schedules);
  const sheets = useProjectStore((s) => s.sheets);
  const { t } = useTranslation();
  // The language with the project's "Units and numbers" (#88): the figures are written as every other sheet's are.
  const locale = useSheetLocale();
  const say = useBoqSay();
  const placed = (sheet.viewports ?? []).flatMap((vp) => schedules?.find((s) => s.id === vp.viewId && s.kind === 'boq') ?? []);
  const result = useBoqResult(placed.length > 0);
  const continued = t('schedule.continued');
  const layouts = useMemo(() => {
    const out = new Map<string, ScheduleLayout>();
    for (const vp of sheet.viewports ?? []) {
      const schedule: ProjectSchedule | undefined = schedules?.find((s) => s.id === vp.viewId && s.kind === 'boq');
      if (!schedule || out.has(schedule.id)) continue;
      out.set(schedule.id, layoutTableOnSheet({ continued, sheets, sheet, vp }, (paging) => layoutBoq(result, { locale, title: schedule.name, say, detail: schedule.detail === true }, paging)));
    }
    return out;
  }, [sheet, sheets, schedules, result, locale, say, continued]);
  // A summary that runs over several pages has a sheet for each: the sheets follow the layout, from the schedule's first one.
  useEffect(() => {
    if (result.lines.length === 0) return;
    for (const vp of sheet.viewports ?? []) {
      const layout = layouts.get(vp.viewId);
      if (layout?.fit && (vp.page ?? 0) === 0) syncSchedulePages(vp.viewId, layout.pages ?? 1);
    }
  }, [layouts, result, sheet.viewports]);
  return layouts;
}
