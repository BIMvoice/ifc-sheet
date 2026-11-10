/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's frame as a drawing's live symbols need it — true north, the
 * map anchor, the render frame's shift — and the per-drawing context built
 * from it (`LiveSymbolContext`).
 *
 * The model it reads is the federation anchor (`useAnchorGeoreference`: the
 * model whose IfcMapConversion defines the world frame every other model was
 * placed in), else the earliest-loaded model, so north and coordinates come
 * from the one model the drawings are in the frame of.
 */

import { useMemo } from 'react';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { useAnchorGeoreference } from '@/lib/geo/useAnchorGeoreference';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import type { SectionAxisName, Vec3 } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';
import { useTranslation } from '@/i18n';
import { siteNorth as engineSiteNorth } from '@bimvoice/ifcsheet/true-north';
import { liveSymbolContext as engineLiveSymbolContext, trueNorthOf, type CoordinateLabeller, type LiveSymbolContext, type PlanDirection } from '@bimvoice/ifcsheet';
import { drawingPointToMap, type MapAnchor } from './map-coordinates';
import { useSheetLocale } from '@/project/units-and-numbers';

export interface SiteFrame {
  /** True north in project XY: the model's TrueNorth, else grid north of its map conversion, else `null` (project north, +Y). */
  north: PlanDirection | null;
  northSource: 'trueNorth' | 'gridNorth' | null;
  anchor: MapAnchor | null;
  /** The render frame's shift (`totalYupOffset`) of the model read, for local coordinates. */
  frameOffset: Vec3;
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** The model's TrueNorth, else grid north of its map conversion, else none (project north). */
export function siteNorth(trueNorth: PlanDirection | null, anchor: Pick<MapAnchor, 'eff'> | null | undefined): Pick<SiteFrame, 'north' | 'northSource'> {
  // The engine's rule, fed the anchor's effective (possibly edited) map conversion.
  const { xAxisAbscissa, xAxisOrdinate } = anchor?.eff.mapConversion ?? {};
  return engineSiteNorth(trueNorth, anchor ? { abscissa: xAxisAbscissa, ordinate: xAxisOrdinate } : null);
}

/** The frame of the anchor (or first) model. Recomputed on load and georeference edits only. */
export function useSiteFrame(): SiteFrame {
  const anchor = useAnchorGeoreference();
  const models = useViewerStore((s) => s.models);
  const legacyStore = useViewerStore((s) => s.ifcDataStore);
  const legacyInfo = useViewerStore((s) => s.geometryResult?.coordinateInfo);
  return useMemo(() => {
    const ordered = [...models.values()].sort((a, b) => (a.loadedAt ?? 0) - (b.loadedAt ?? 0));
    const anchorModel = anchor ? models.get(anchor.modelId) : undefined;
    const model = anchorModel ?? ordered.find((m) => m.ifcDataStore);
    const store = (model?.ifcDataStore ?? legacyStore) as IfcDataStore | null;
    const info = model ? model.geometryResult?.coordinateInfo : legacyInfo;
    return {
      ...siteNorth(trueNorthOf(store), anchor),
      anchor: anchor ? { eff: anchor.eff, originViewer: anchor.originViewer } : null,
      frameOffset: info ? totalYupOffset(info) : ZERO,
    };
  }, [anchor, models, legacyStore, legacyInfo]);
}

/** Builds the coordinate label lines, given how to translate them. */
export type { CoordinateLabeller };

/**
 * The live-symbol context of one drawing: shown at `scale`, on `plane`. `null` plane (no drawing yet): only the scale is known.
 * Built by the engine's one function (`site-frame.ts` of `@bimvoice/ifcsheet`), which the PDF of `ifcsheet build` calls too; this adds the
 * anchor's map coordinates.
 */
export function liveSymbolContext(
  frame: SiteFrame, plane: SectionPlaneConfig | null | undefined, axis: SectionAxisName, scale: number,
  locale: SheetLocale, label: CoordinateLabeller,
): LiveSymbolContext {
  const { anchor } = frame;
  return engineLiveSymbolContext({
    north: frame.north, frameOffset: frame.frameOffset,
    ...(anchor ? { mapPoint: (p: SectionPlaneConfig, q: Pt) => { const m = drawingPointToMap(p, q, anchor); return { e: m.e, n: m.n }; } } : {}),
  }, plane, axis, scale, locale, label);
}

/** `liveSymbolContext` with the active locale and the coordinate labels translated. */
export function useLiveSymbolContext(plane: SectionPlaneConfig | null | undefined, axis: SectionAxisName, scale: number): LiveSymbolContext {
  const frame = useSiteFrame();
  const { t } = useTranslation();
  const locale = useSheetLocale();
  return useMemo(() => liveSymbolContext(frame, plane, axis, scale, locale, (kind, a, b) => (kind === 'map'
    ? [t('site.coordinates.e', { value: a }), t('site.coordinates.n', { value: b })]
    : [t('site.coordinates.x', { value: a }), t('site.coordinates.y', { value: b })])), [frame, plane, axis, scale, locale, t]);
}
