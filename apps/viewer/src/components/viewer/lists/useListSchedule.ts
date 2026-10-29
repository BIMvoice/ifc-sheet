/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Schedules built from the Lists engine (#78) as the screen reads them: each one is run over the loaded models (`runListSchedule`, the Lists
 * panel's own function) again only when something the run reads changes (the models, an edit, the tags, the zones, the unit overrides) or
 * when the definition does; the words in the interface's language; and the layouts of the ones placed on a sheet. A run is asynchronous
 * (a property-heavy list over a large federation takes a while), so a table appears when its run is done.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { listScheduleTable, type ListScheduleDef, type ListScheduleTable } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { useSheetLocale } from '@/project/units-and-numbers';
import { layoutTableOnSheet, syncSchedulePages } from '@/project/schedule-fit';
import type { ProjectSchedule, ProjectSheet } from '@/project/types';
import { layoutListSchedule } from '@bimvoice/ifcsheet';
import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { prepareListProviders } from '@/lib/lists/prepare-providers';
import { listTableSourceOf, runListSchedule, type ListScheduleRun } from '@/lib/lists/list-schedule-run';

export type ListRunState =
  | { status: 'resolving' }
  | { status: 'no-model' }
  | { status: 'error'; message: string }
  | { status: 'ok'; run: ListScheduleRun };

const RESOLVING: ListRunState = { status: 'resolving' };
const NO_MODEL: ListRunState = { status: 'no-model' };
const NO_SCHEDULES: ProjectSchedule[] = [];

/** A list schedule with its definition. */
const isListSchedule = (s: ProjectSchedule | undefined): s is ProjectSchedule & { list: ListScheduleDef } => s?.kind === 'list' && !!s.list;

/** What a run reads of the definition: not the name, which only titles the table, and not the overrides, which are printed in afterwards (`listTableSourceOf`) and must not run the list again. */
const fingerprint = ({ overrides: _overrides, ...list }: ListScheduleDef): string => JSON.stringify(list);

/** The same object while every dep is `===` its predecessor; a new one otherwise. */
function useStableKey(deps: readonly unknown[]): object {
  const ref = useRef<{ deps: readonly unknown[]; key: object } | null>(null);
  const prev = ref.current;
  if (prev && prev.deps.length === deps.length && prev.deps.every((d, i) => d === deps[i])) return prev.key;
  const next = { deps, key: {} };
  ref.current = next;
  return next.key;
}

const nextFrame = (fn: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(fn, 0);
  return () => clearTimeout(handle);
};

/** Whether the models have data to list, read without building the providers. */
function useHasModels(): boolean {
  return useViewerStore((s) => [...s.models.values()].some((m) => m.ifcDataStore) || !!s.ifcDataStore);
}

/**
 * The run of each schedule given, by schedule id. A result is valid only for the data it was computed from: when the models, an edit, the
 * tags, the zones or the unit overrides change, the old results are unreachable and the runs start again, so a reloaded model can never
 * show rows from the one it replaced. Schedules with the same definition share one run.
 */
function useListScheduleRuns(schedules: readonly ProjectSchedule[]): ReadonlyMap<string, ListRunState> {
  const hasData = useHasModels();
  const models = useViewerStore((s) => s.models);
  const ifcDataStore = useViewerStore((s) => s.ifcDataStore);
  const unitDisplayOverrides = useViewerStore((s) => s.unitDisplayOverrides);
  const modelTags = useViewerStore((s) => s.modelTags);
  const modelTagAssignments = useViewerStore((s) => s.modelTagAssignments);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const zoneSets = useViewerStore((s) => s.zoneSets);
  const zoneAssignments = useViewerStore((s) => s.zoneAssignments);
  const zoneApportionment = useViewerStore((s) => s.zoneApportionment);
  // The data stores (not the model objects: a streamed batch replaces those) stand for the federation.
  const stores = useMemo(() => [...models.values()].map((m) => m.ifcDataStore ?? null), [models]);
  const dataKey = useStableKey([ifcDataStore, ...stores, unitDisplayOverrides, modelTags, modelTagAssignments, mutationVersion, zoneSets, zoneAssignments, zoneApportionment]);

  const wanted = useMemo(() => {
    const byFingerprint = new Map<string, ProjectSchedule & { list: ListScheduleDef }>();
    for (const s of schedules) if (isListSchedule(s)) byFingerprint.set(fingerprint(s.list), s);
    return byFingerprint;
  }, [schedules]);

  const [results, setResults] = useState<{ key: object; byFingerprint: ReadonlyMap<string, ListRunState> }>({ key: dataKey, byFingerprint: new Map() });
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const current = results.key === dataKey ? results.byFingerprint : null;

  useEffect(() => {
    if (!hasData) return;
    const live = resultsRef.current;
    const done = live.key === dataKey ? live.byFingerprint : new Map<string, ListRunState>();
    const todo = [...wanted].filter(([fp]) => !done.has(fp));
    if (todo.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    let cancelFrame: (() => void) | null = null;
    // One list per frame, in sequence: two heavy lists must not double the stall.
    const runAt = (i: number): void => {
      if (cancelled || i >= todo.length) return;
      cancelFrame = nextFrame(() => { void (async () => {
        if (cancelled) return;
        const [fp, schedule] = todo[i];
        let state: ListRunState;
        try {
          const store = useViewerStore.getState();
          const { pairs, modelUnits } = prepareListProviders(store, {});
          state = { status: 'ok', run: await runListSchedule(schedule, pairs, modelUnits, store, { signal: controller.signal }) };
        } catch (err) {
          if (cancelled) return;
          console.error('[Schedules] list schedule run failed:', err);
          state = { status: 'error', message: err instanceof Error ? err.message : String(err) };
        }
        if (cancelled) return;
        setResults((prev) => ({ key: dataKey, byFingerprint: new Map(prev.key === dataKey ? prev.byFingerprint : []).set(fp, state) }));
        runAt(i + 1);
      })(); });
    };
    runAt(0);
    return () => { cancelled = true; controller.abort(); cancelFrame?.(); };
  }, [dataKey, wanted, hasData]);

  return useMemo(() => {
    const out = new Map<string, ListRunState>();
    for (const s of schedules) if (isListSchedule(s)) out.set(s.id, hasData ? (current?.get(fingerprint(s.list)) ?? RESOLVING) : NO_MODEL);
    return out;
  }, [schedules, current, hasData]);
}

/** The run of one schedule, `undefined` when it is not a list schedule. */
export function useListScheduleRun(schedule: ProjectSchedule | undefined): ListRunState | undefined {
  const given = useMemo(() => (schedule && isListSchedule(schedule) ? [schedule] : NO_SCHEDULES), [schedule]);
  return useListScheduleRuns(given).get(schedule?.id ?? '');
}

/** The words a list table says that the Lists engine does not, in the interface's language. */
export function useListWords(): { count: string; total: string; yes: string; no: string; missing: string } {
  const { t } = useTranslation();
  return useMemo(() => ({ count: t('listSched.count'), total: t('listSched.total'), yes: t('listSched.yes'), no: t('listSched.no'), missing: t('listSched.missing') }), [t]);
}

/** The table of a run, as the sheet, the CSV and the XLSX hold it. */
export function useListTable(schedule: ProjectSchedule, state: ListRunState | undefined): ListScheduleTable | null {
  const words = useListWords();
  return useMemo(() => (state?.status === 'ok' && schedule.list ? listScheduleTable(listTableSourceOf(state.run, schedule.list, words), schedule.list, schedule.name, words) : null), [state, schedule.list, schedule.name, words]);
}

/** The layouts of the list schedules placed on `sheet`, by schedule id, and the sheets that follow when one runs over several pages. */
export function useListSheetLayouts(sheet: ProjectSheet): Map<string, ScheduleLayout> {
  const schedules = useProjectStore((s) => s.schedules);
  const sheets = useProjectStore((s) => s.sheets);
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const words = useListWords();
  const placed = useMemo(() => (sheet.viewports ?? []).flatMap((vp) => schedules?.find((s) => s.id === vp.viewId && isListSchedule(s)) ?? []), [sheet.viewports, schedules]);
  const runs = useListScheduleRuns(placed.length > 0 ? placed : NO_SCHEDULES);
  const continued = t('schedule.continued');
  const layouts = useMemo(() => {
    const out = new Map<string, ScheduleLayout>();
    for (const vp of sheet.viewports ?? []) {
      const schedule = placed.find((s) => s.id === vp.viewId);
      const state = schedule && runs.get(schedule.id);
      if (!schedule?.list || state?.status !== 'ok' || out.has(schedule.id)) continue;
      const table = listScheduleTable(listTableSourceOf(state.run, schedule.list, words), schedule.list, schedule.name, words);
      out.set(schedule.id, layoutTableOnSheet({ continued, sheets, sheet, vp }, (paging) => layoutListSchedule(table, { locale, title: schedule.name }, paging)));
    }
    return out;
  }, [sheet, sheets, placed, runs, locale, words, continued]);
  // A table that runs over several pages has a sheet for each: the sheets follow the layout, from the schedule's first one.
  useEffect(() => {
    for (const vp of sheet.viewports ?? []) {
      const layout = layouts.get(vp.viewId);
      if (layout?.fit && (vp.page ?? 0) === 0) syncSchedulePages(vp.viewId, layout.pages ?? 1);
    }
  }, [layouts, sheet.viewports]);
  return layouts;
}
