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
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { ensureWasm, wasmLoaded } from '@/lib/wasm/ensure-wasm';
import { collectUrbanAreas, type UrbanAreas } from '@/urban/urban-models';
import { urbanIndicators, type UrbanIndicators } from '@/urban/indicators';
import { signedLevel, type UrbanLabels } from '@/urban/urban-layout';
import { siteAreaOf, type SiteAreaChoice } from '@/urban/site-area';

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

/** The indicators of `areas` on the site area `siteAreaOf` picks and the project's urban settings; `site` says which it took. The hook and the exports share it. */
export function urbanResultOf(areas: UrbanAreas, project: UrbanProject): { areas: UrbanAreas; result: UrbanIndicators; site: SiteAreaChoice } {
  const site = siteAreaOf({ siteArea: project.siteArea, views: project.views, drafts: project.drafts }, areas.modelSiteArea);
  return { areas, result: urbanIndicators({ ...areas, siteArea: site.area, settings: project.urbanSettings }), site };
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
export function siteSourceNote(t: T, locale: string, site: SiteAreaChoice): string {
  if (site.source === 'typed') {
    return site.plot === null ? t('urban.siteSource.typedNoPlot') : t('urban.siteSource.typed', { plot: sheetNumber(locale, site.plot) });
  }
  return t(`urban.siteSource.${site.source ?? 'none'}`);
}

/** Where the site area came from, in words: one sentence for every table that prints it. */
export function useSiteSourceNote(): (site: SiteAreaChoice) => string {
  const { t, locale } = useTranslation();
  return useMemo(() => (site: SiteAreaChoice) => siteSourceNote(t, locale, site), [t, locale]);
}

/** The schedule's labels; `site`, when given, adds the line saying where the site area came from. Pure: the Wall's export builds them too. */
export function urbanLabelsOf(t: T, locale: string, title: string, areas: UrbanAreas | null, site?: SiteAreaChoice): UrbanLabels {
  const assumed = areas?.assumedInterior.join(', ') ?? '';
  const leftOut = areas?.spacesLeftOut ?? null;
  const estimated = areas?.estimated ?? null;
  return {
    locale,
    title,
    level: t('urban.level'), elevation: t('urban.elevation'), built: t('urban.built'), useful: t('urban.useful'),
    inCut: t('urban.inCut'), yes: t('urban.yes'), no: t('urban.no'),
    belowGround: (name: string) => t('urban.belowGround', { name }),
    ground: (name: string) => t('urban.ground', { name }),
    category: t('urban.category'), area: t('urban.area'),
    ac: t('urban.ac'), ad: t('urban.ad'), adCut: t('urban.adCut'), au: t('urban.au'), site: t('urban.site'), pot: t('urban.pot'), cut: t('urban.cut'),
    rules: (r: UrbanIndicators) => {
      const left = r.storeys.filter((s) => !s.inCut).map((s) => s.name);
      const out = [
        t('urban.rule.areas', { level: r.storeys.find((s) => s.ground)?.name ?? '—' }),
        t('urban.rule.cut', { levels: left.length ? left.join(', ') : t('urban.rule.cutNone') }),
        t('urban.rule.ground', { terrain: signedLevel(locale, r.terrainLevel), zero: sheetNumber(locale, r.zero.elevation, 2, { group: false }), source: t(`urban.rule.zero.${r.zero.source}`) }),
      ];
      if (estimated) out.push(t('urban.rule.auEstimated', { count: estimated.count, area: sheetNumber(locale, estimated.area, 1), share: sheetNumber(locale, estimated.share, 0), list: estimated.rooms.map((r) => r.name).join(', ') }));
      if (leftOut) out.push(t('urban.rule.au', { external: leftOut.external, gfa: leftOut.gfa, parents: leftOut.parents }));
      if (site) out.push(siteSourceNote(t, locale, site));
      return out;
    },
    note: assumed ? t('urban.assumedInterior', { levels: assumed }) : '',
    atLeast: (value: string) => t('urban.atLeast', { value }),
    unmeasured: (count: number, level: string) => t('urban.unmeasured', { count, level }),
  };
}

/** The schedule's labels; `site`, when given, adds the line saying where the site area came from. */
export function useUrbanLabels(title: string, areas: UrbanAreas | null, site?: SiteAreaChoice): UrbanLabels {
  const { t, locale } = useTranslation();
  const assumed = areas?.assumedInterior.join(', ') ?? '';
  const leftOut = areas?.spacesLeftOut ?? null;
  const estimated = areas?.estimated ?? null;
  return useMemo(() => urbanLabelsOf(t, locale, title, areas, site),
    // assumed / leftOut / estimated: the only parts of `areas` the labels read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, title, assumed, leftOut, estimated, site]);
}
