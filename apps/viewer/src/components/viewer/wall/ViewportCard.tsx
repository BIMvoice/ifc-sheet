/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card for the drawing chosen on a sheet: its name, its scale (`ScaleField`), its cut
 * or depth, opening it to draw in, taking it off the sheet; and below, any
 * drawing or schedule not yet on this sheet, to place on it.
 */

import { useTranslation } from '@/i18n';
import { placeLegend } from '@/legend/legend-actions';
import { renameProjectItem, useProjectStore } from '@/project/project-store';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { addViewport, removeViewport, updateViewport } from '@/project/sheets';
import { isResizable } from '@/project/viewport-resize';
import { isFittedSchedule } from '@/project/schedule-fit';
import { drawingNumbers } from '@/drafting/cross-ref';
import { drawingArea } from '@/project/drawing-set';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { useLegendLabels } from '../legend/LegendGraphic';
import { LegendCard } from './LegendCard';
import { hasTrueScale } from '@/project/axonometric';
import { ScaleField } from './ScaleField';
import { SubReportCard } from './SubReportCard';
import { ThreeDControls } from './ThreeDControls';
import { CutHeightControl, DepthControl } from './ViewControls';
import { startWhenAttached } from './wall-actions';
import { addKeyPlan, drawPlotBoundary } from '@/siteplan/site-actions';
import { WALL_CARD, WALL_FIELD, WALL_PILL } from './wall-type';

const field = WALL_FIELD;
const quiet = WALL_PILL;

interface ViewportCardProps {
  sheet: ProjectSheet;
  slot: SheetViewport | null;
  onOpen: (vp: SheetViewport) => void;
  onChoose: (viewportId: string | null) => void;
  /** The chosen drawing's extent, metres, once generated: says when it does not fit the sheet. */
  drawingBounds?: { min: { x: number; y: number }; max: { x: number; y: number } } | null;
}

export function ViewportCard({ sheet, slot, onOpen, onChoose, drawingBounds = null }: ViewportCardProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const view = views.find((v) => v.id === slot?.viewId);
  const legends = useProjectStore((s) => s.legends ?? []);
  const labels = useLegendLabels();
  const schedule = schedules.find((s) => s.id === slot?.viewId);
  const legend = legends.find((l) => l.id === slot?.viewId);
  const name = view?.name ?? schedule?.name ?? legend?.name ?? '';
  const placed = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  const placeable = [
    ...views.filter((v) => !placed.has(v.id)).map((v) => ({ id: v.id, name: v.name })),
    ...schedules.filter((s) => !placed.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
    ...legends.filter((l) => !placed.has(l.id)).map((l) => ({ id: l.id, name: l.name })),
  ];

  const place = (id: string): void => {
    // A legend sets its own size, at paper size, in a free place.
    if (legends.some((l) => l.id === id)) {
      onChoose(placeLegend(sheet.id, id, labels));
      return;
    }
    const area = drawingArea(sheet);
    const scale = views.find((v) => v.id === id)?.scale ?? slot?.scale ?? 100;
    onChoose(addViewport(sheet.id, id, { x: area.x + area.w / 2, y: area.y + area.h / 2 }, scale));
  };

  return (
    <aside className={WALL_CARD}>
      {slot ? (
        <>
          <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.vp.eyebrow')}</p>
          <label className="mt-2 block text-xs text-sky-200">
            {t('wall.project.rename')}
            <input key={slot.viewId} className={field} defaultValue={name} onBlur={(e) => renameProjectItem(slot.viewId, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </label>
          {legend ? <LegendCard legend={legend} /> : (
            <>
              <label className="mt-4 block text-xs text-sky-200">
                {t('wall.vp.drawingNumber')}
                <input
                  key={`${slot.id}:${slot.drawingNumber ?? ''}`} className={field} defaultValue={slot.drawingNumber ?? ''}
                  placeholder={drawingNumbers({ viewports: (sheet.viewports ?? []).map((vp) => (vp.id === slot.id ? { ...vp, drawingNumber: undefined } : vp)) }, new Set(views.map((v) => v.id))).get(slot.id) ?? ''}
                  onBlur={(e) => updateViewport(sheet.id, slot.id, { drawingNumber: e.target.value.trim() || undefined })}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              </label>
              {hasTrueScale(view) ? <ScaleField sheet={sheet} slot={slot} view={view} bounds={drawingBounds} /> : null}
            </>
          )}
          {schedule ? <SubReportCard schedule={schedule} /> : null}
          {view?.kind === '3d' ? <ThreeDControls view={view} slot={slot} bounds={drawingBounds} /> : null}
          {view?.kind === 'plan' ? <div className="mt-4"><CutHeightControl view={view} /></div> : null}
          {view?.kind === 'section' || view?.kind === 'elevation' ? <div className="mt-4"><DepthControl view={view} /></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {view ? <button type="button" className={quiet} onClick={() => onOpen(slot)}>{t('wall.vp.open')}</button> : null}
            {(isResizable(view) || (isFittedSchedule(schedule) && (slot.page ?? 0) === 0)) && slot.width > 0 && slot.height > 0 ? (
              <button type="button" className={quiet} onClick={() => runAsOneUndoStep(() => updateViewport(sheet.id, slot.id, { width: 0, height: 0, center: null }))}>{t('wall.vp.fit')}</button>
            ) : null}
            {view?.kind === 'plan' && view.site ? <button type="button" className={quiet} onClick={() => { drawPlotBoundary(slot.viewId, startWhenAttached); onOpen(slot); }}>{t('site.drawBoundary')}</button> : null}
            {view?.kind === 'plan' && !slot.keyPlanOf ? <button type="button" className={quiet} onClick={() => onChoose(addKeyPlan(sheet, slot, drawingBounds))}>{t('site.keyPlan.add')}</button> : null}
            <button type="button" className={quiet} onClick={() => { removeViewport(sheet.id, slot.id); onChoose(null); }}>{t('wall.vp.remove')}</button>
          </div>
        </>
      ) : (
        <p className="m-0 text-sm text-sky-200">{t('wall.vp.none')}</p>
      )}
      {placeable.length > 0 ? (
        <label className="mt-5 block border-t border-sky-300/20 pt-4 text-xs text-sky-200">
          {t('wall.vp.place')}
          <select className={field} value="" onChange={(e) => e.target.value && place(e.target.value)}>
            <option value="">{t('wall.vp.placePick')}</option>
            {placeable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : null}
    </aside>
  );
}
