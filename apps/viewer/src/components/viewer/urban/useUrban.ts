/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit's areas and urban indicators, live: the footprints and rooms are
 * read again when the models or the levels change, and the indicators when
 * the site area does. The site area is the project's (`siteArea`), else the
 * model's; every table showing the indicators reads it from here, so a new
 * site area reaches all of them.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { ensureWasm, wasmLoaded } from '@/lib/wasm/ensure-wasm';
import { collectUrbanAreas, type UrbanAreas } from '@/urban/urban-models';
import { urbanIndicators, type UrbanIndicators } from '@/urban/indicators';
import { signedLevel, type UrbanLabels } from '@/urban/urban-layout';

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

/** The indicators, on the project's site area (else the model's) and its urban settings. */
export function useUrbanIndicators(enabled = true): { areas: UrbanAreas; result: UrbanIndicators } | null {
  const areas = useUrbanAreas(enabled);
  const siteArea = useProjectStore((s) => s.siteArea);
  const settings = useProjectStore((s) => s.urbanSettings);
  return useMemo(
    () => (areas ? { areas, result: urbanIndicators({ ...areas, siteArea: siteArea ?? areas.modelSiteArea, settings }) } : null),
    [areas, siteArea, settings],
  );
}

export function useUrbanLabels(title: string, areas: UrbanAreas | null): UrbanLabels {
  const { t } = useTranslation();
  const assumed = areas?.assumedInterior.join(', ') ?? '';
  const leftOut = areas?.spacesLeftOut ?? null;
  return useMemo(() => ({
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
        t('urban.rule.ground', { terrain: signedLevel(r.terrainLevel), zero: r.zero.elevation.toFixed(2), source: t(`urban.rule.zero.${r.zero.source}`) }),
      ];
      if (leftOut) out.push(t('urban.rule.au', { external: leftOut.external, gfa: leftOut.gfa, parents: leftOut.parents }));
      return out;
    },
    note: assumed ? t('urban.assumedInterior', { levels: assumed }) : '',
    atLeast: (value: string) => t('urban.atLeast', { value }),
    unmeasured: (count: number, level: string) => t('urban.unmeasured', { count, level }),
  }), [t, title, assumed, leftOut]);
}
