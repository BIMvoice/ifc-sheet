/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit's areas and urban indicators, live: the footprints and rooms are
 * read again when the models or the levels change, and the indicators when
 * the site area does. The site area is the one `urban/site-area.ts` picks
 * (typed, else the plot drawn on the site plan, else the model's); every
 * table showing the indicators reads it from here, so a new site area or a
 * redrawn plot reaches all of them.
 */

import { useEffect, useMemo, useState } from 'react';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';
import { siteSourceNote as engineSiteSourceNote, urbanLabelsOf as engineUrbanLabelsOf, type SiteAreaChoice, type UrbanLabels } from '@bimvoice/ifcsheet';
import { urbanResultOf as engineUrbanResultOf } from '@bimvoice/ifcsheet/urban';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { ensureWasm, wasmLoaded } from '@/lib/wasm/ensure-wasm';
import { collectUrbanAreas, type UrbanAreas } from '@/urban/urban-models';
import type { UrbanIndicators } from '@/urban/indicators';
import { useSheetLocale } from '@/project/units-and-numbers';

/** The footprints, rooms and model site area; null until they can be measured. `enabled` false skips the work. */
export function useUrbanAreas(enabled = true): UrbanAreas | null {
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const levels = useProjectStore((s) => s.levels);
  const [wasmTick, setWasmTick] = useState(0);
  const areas = useMemo(() => {
    if (!enabled) return null;
    try {
      return collectUrbanAreas();
    } catch (err) {
      // Not yet initialised in this realm: the effect below initialises it and measures again.
      if (!wasmLoaded()) return null;
      console.warn('[urban] could not measure the storeys', err);
      return null;
    }
    // models / mutationVersion / levels: what `collectUrbanAreas` reads; wasmTick: the module came up.
  }, [enabled, models, mutationVersion, levels, wasmTick]);
  const waiting = enabled && areas === null && !wasmLoaded();
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    ensureWasm().then(() => { if (live) setWasmTick((n) => n + 1); }, (err: unknown) => console.warn('[urban] the geometry module did not load', err));
    return () => { live = false; };
  }, [waiting]);
  return areas;
}

/** What the indicators read from the project besides the measured areas. */
export type UrbanProject = Pick<ReturnType<typeof useProjectStore.getState>, 'siteArea' | 'views' | 'drafts' | 'urbanSettings'>;

/** The indicators of `areas` on the site area `siteAreaOf` picks and the project's urban settings; `site` says which it took. The hook and the exports share it (the engine's, the one the build uses). */
export function urbanResultOf(areas: UrbanAreas, project: UrbanProject): { areas: UrbanAreas; result: UrbanIndicators; site: SiteAreaChoice } {
  return engineUrbanResultOf(areas, project);
}

/** The indicators, on the site area `siteAreaOf` picks and the project's urban settings; `site` says which it took. */
export function useUrbanIndicators(enabled = true): { areas: UrbanAreas; result: UrbanIndicators; site: SiteAreaChoice } | null {
  const areas = useUrbanAreas(enabled);
  const siteArea = useProjectStore((s) => s.siteArea);
  // The plot boundary drawn on the site plan: a draft edit re-reads the indicators (arithmetic; the areas are not measured again).
  const views = useProjectStore((s) => s.views);
  const drafts = useProjectStore((s) => s.drafts);
  const settings = useProjectStore((s) => s.urbanSettings);
  return useMemo(() => (areas ? urbanResultOf(areas, { siteArea, views, drafts, urbanSettings: settings }) : null), [areas, siteArea, views, drafts, settings]);
}

type T = ReturnType<typeof useTranslation>['t'];

/** Where the site area came from, in words: one sentence for every table that prints it. */
export function siteSourceNote(t: T, locale: SheetLocale, site: SiteAreaChoice): string {
  return engineSiteSourceNote((key, params) => t(key, params), locale, site);
}

/** Where the site area came from, in words: one sentence for every table that prints it. */
export function useSiteSourceNote(): (site: SiteAreaChoice) => string {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => (site: SiteAreaChoice) => siteSourceNote(t, locale, site), [t, locale]);
}

/** The schedule's labels; `site`, when given, adds the line saying where the site area came from. Pure: the Wall's export builds them too. Built by the engine's `urbanLabelsOf`, the build `ifcsheet build --project` prints with. */
export function urbanLabelsOf(t: T, locale: SheetLocale, title: string, areas: UrbanAreas | null, site?: SiteAreaChoice): UrbanLabels {
  return engineUrbanLabelsOf((key, params) => t(key, params), locale, title, areas, site);
}

/** The schedule's labels; `site`, when given, adds the line saying where the site area came from. */
export function useUrbanLabels(title: string, areas: UrbanAreas | null, site?: SiteAreaChoice): UrbanLabels {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const assumed = areas?.assumedInterior.join(', ') ?? '';
  const leftOut = areas?.spacesLeftOut ?? null;
  const estimated = areas?.estimated ?? null;
  return useMemo(() => urbanLabelsOf(t, locale, title, areas, site),
    // assumed / leftOut / estimated: the only parts of `areas` the labels read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, title, assumed, leftOut, estimated, site]);
}
