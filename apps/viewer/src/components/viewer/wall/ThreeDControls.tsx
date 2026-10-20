/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a 3D view on a sheet offers in its card: how it prints (an axonometric
 * at a true scale, as vector hidden-line lines, or a perspective with no scale),
 * the corner an axonometric is seen from, shading it as an image, and the
 * capture an image print needs at the viewport's size.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { captureViewRaster, type RasterCaptureDeps } from '@/lib/export/view-raster-capture';
import { AXONOMETRIC_PRESETS, isRasterView, projectionOf } from '@/project/axonometric';
import { updateProjectView } from '@/project/project-store';
import { viewportBox } from '@/project/sheets';
import { PRINT_DPI, rasterFits } from '@/project/view-raster';
import type { AxonometricPreset, SheetViewport, ThreeDProjectView, ThreeDProjection } from '@/project/types';

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-base text-white';
const quiet = 'rounded-full border border-sky-300/30 px-3 py-1.5 text-sm text-sky-100 hover:border-sky-300/70';
const SAVED = 'saved';

interface ThreeDControlsProps {
  view: ThreeDProjectView;
  slot: SheetViewport;
  /** The placed drawing's extent, metres, if it has one: an auto-fit slot (0 × 0) takes its box from it, as the sheet does. */
  bounds?: { min: { x: number; y: number }; max: { x: number; y: number } } | null;
  /** How the viewport is captured; the live 3D view unless a test hands in its own. */
  captureDeps?: RasterCaptureDeps;
}

export function ThreeDControls({ view, slot, bounds = null, captureDeps }: ThreeDControlsProps) {
  const { t } = useTranslation();
  const [failure, setFailure] = useState<string | null>(null);
  const projection = projectionOf(view);
  // The box the sheet draws the viewport in: a slot placed as vector stays 0 × 0 and fits its drawing.
  const box = viewportBox(slot, bounds);
  const capture = async (): Promise<void> => {
    setFailure(null);
    try {
      updateProjectView(view.id, { raster: await captureViewRaster(view, box, captureDeps) });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="mt-4 space-y-3 text-sm text-sky-200">
      <label className="block">
        {t('wall.vp.threeD.projection')}
        <select className={field} value={projection} onChange={(e) => updateProjectView(view.id, { projection: e.target.value as ThreeDProjection })}>
          <option value="axonometric">{t('wall.vp.threeD.axonometric')}</option>
          <option value="perspective">{t('wall.vp.threeD.perspective')}</option>
        </select>
      </label>
      {projection === 'axonometric' ? (
        <>
          <label className="block">
            {t('wall.vp.threeD.corner')}
            <select
              className={field}
              value={view.preset ?? (view.viewpoint ? SAVED : 'se')}
              onChange={(e) => updateProjectView(view.id, { preset: e.target.value === SAVED ? undefined : (e.target.value as AxonometricPreset) })}
            >
              {view.viewpoint ? <option value={SAVED}>{t('wall.vp.threeD.corner.saved')}</option> : null}
              {AXONOMETRIC_PRESETS.map((p) => <option key={p} value={p}>{t(`wall.vp.threeD.corner.${p}`)}</option>)}
            </select>
          </label>
          {view.viewpoint ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={view.shaded === true} onChange={(e) => updateProjectView(view.id, { shaded: e.target.checked, ...(e.target.checked ? { preset: undefined } : {}) })} />
              {t('wall.vp.threeD.shaded')}
            </label>
          ) : null}
        </>
      ) : null}
      {isRasterView(view) ? (
        <div className="space-y-2">
          <button type="button" className={quiet} onClick={() => void capture()}>{t('wall.vp.threeD.capture', { dpi: PRINT_DPI })}</button>
          {view.raster
            ? <p className="m-0">{rasterFits(view.raster, box) ? t('wall.vp.threeD.captured', { w: view.raster.widthPx, h: view.raster.heightPx, mmw: Math.round(view.raster.widthMm), mmh: Math.round(view.raster.heightMm) }) : t('wall.vp.threeD.stale')}</p>
            : <p className="m-0">{t('wall.vp.threeD.none')}</p>}
          {failure ? <p className="m-0 text-amber-300">{t('wall.vp.threeD.failed', { reason: failure })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
