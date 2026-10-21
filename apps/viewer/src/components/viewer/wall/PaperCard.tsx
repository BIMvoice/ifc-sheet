/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card for a stepped-into sheet's paper: its size (A-series, elongated
 * or custom), orientation, frame margins and title block position, or a
 * template to take them all from. A new paper or orientation lays the
 * sheet's drawings out again at the scale that fits; a frame change keeps
 * them as they are, inside the drawing area (`setSheetFormat`). The sheet can be saved as
 * a template, and the template its series starts new sheets from is chosen
 * here.
 */

import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import type { BoxOf } from '@/project/sheet-refit';
import { sheetSeries } from '@/project/drawing-set';
import { setSheetFormat } from '@/project/drawing-set-actions';
import { CUSTOM_MM, ELONGATED_PAPERS, ISO_PAPERS, isCustom, paperFromLabel, paperLabel, paperMm } from '@/project/paper';
import { useProjectStore } from '@/project/project-store';
import { DEFAULT_FRAME, frameOf, type FrameProblem } from '@/project/sheet-frame';
import { allTemplates, findTemplate, templateFields } from '@/project/sheet-templates';
import { saveSheetTemplate, setSeriesTemplate } from '@/project/sheets';
import type { ProjectSheet, SheetFrame, TemplateSeries } from '@/project/types';
import { WALL_CARD, WALL_FIELD, WALL_PILL } from './wall-type';

const field = WALL_FIELD;
const quiet = WALL_PILL;
const CUSTOM = 'custom';
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SIDE_KEYS: Record<(typeof SIDES)[number], TranslationKey> = { top: 'wall.paper.top', right: 'wall.paper.right', bottom: 'wall.paper.bottom', left: 'wall.paper.left' };
const SERIES_KEYS: Record<TemplateSeries, TranslationKey> = {
  plans: 'wall.group.plans', elevations: 'wall.group.elevations', sections: 'wall.group.sections', interiors: 'wall.group.interiors', schedules: 'wall.group.schedules', details: 'wall.series.details',
};
const SIZES = [...ISO_PAPERS, ...ELONGATED_PAPERS].map(paperLabel);

/** A number field that applies on Enter or when left, and shows what is wrong with a value out of range. */
function Mm({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (mm: number) => boolean }) {
  const [bad, setBad] = useState(false);
  const commit = (text: string): void => {
    const n = Number(text);
    const ok = text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max;
    // A value in range can still be refused (the frame could not hold the title block).
    setBad(!ok || (n !== value && !onCommit(n)));
  };
  return (
    <label className="block text-xs text-sky-200">
      {label}
      <input
        key={value}
        data-owns-keys
        inputMode="decimal"
        className={field}
        defaultValue={value}
        aria-invalid={bad}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}

/** `boxOf` is each viewport's box as the sheet draws it, so a schedule or legend is kept whole inside the drawing area. */
export function PaperCard({ sheet, extent, boxOf, onClose }: { sheet: ProjectSheet; extent: ModelExtent | null; boxOf?: BoxOf; onClose: () => void }) {
  const { t } = useTranslation();
  const own = useProjectStore((s) => s.sheetTemplates);
  const chosen = useProjectStore((s) => s.seriesTemplates);
  const [saving, setSaving] = useState('');
  const paper = sheet.paper ?? 'A1';
  const frame = frameOf(sheet);
  const series = sheetSeries(sheet);
  const templates = allTemplates(own);
  const custom = isCustom(paper);
  const [asCustom, setAsCustom] = useState(custom);
  // The paper as it lies on the sheet: what the size fields and the dimensions read.
  const { w, h } = paperMm(paper, sheet.orientation);
  /** A custom paper `width` × `height` on the sheet, as typed: the orientation follows which side is longer. */
  const setCustom = (width: number, height: number): boolean =>
    set({ paper: { kind: 'custom', widthMm: width, heightMm: height }, orientation: height > width ? 'portrait' : 'landscape', templateId: null });
  const [problem, setProblem] = useState<FrameProblem | null>(null);
  /** Make the change, or keep why it was refused; true when it was made. */
  const set = (patch: Parameters<typeof setSheetFormat>[1]): boolean => {
    const refused = setSheetFormat(sheet.id, patch, extent, boxOf);
    setProblem(refused);
    return refused === null;
  };
  // Anything set by hand no longer follows the template the sheet came from.
  const setFrame = (next: SheetFrame): boolean => set({ frame: next, templateId: null });

  return (
    <aside aria-label={t('wall.paper.title')} data-owns-keys className={`max-h-[calc(100vh-12rem)] overflow-y-auto ${WALL_CARD}`}>
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.paper.title')}</p>
      <p className="mb-2 mt-2 text-sm leading-relaxed text-sky-200">{t('wall.paper.hint', { number: sheet.number })}</p>

      <label className="mt-2 block text-xs text-sky-200">
        {t('wall.paper.template')}
        <select className={field} value={sheet.templateId ?? ''} onChange={(e) => { const tpl = findTemplate(e.target.value, own); if (tpl) { setAsCustom(isCustom(tpl.paper)); set(templateFields(tpl)); } }}>
          <option value="">{t('wall.paper.templatePick')}</option>
          {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{`${tpl.name} (${paperLabel(tpl.paper)})`}</option>)}
        </select>
      </label>

      <label className="mt-3 block text-xs text-sky-200">
        {t('wall.paper.size')}
        <select
          className={field}
          value={asCustom ? CUSTOM : paperLabel(paper)}
          onChange={(e) => {
            if (e.target.value === CUSTOM) { setAsCustom(true); return; }
            setAsCustom(false);
            const next = paperFromLabel(e.target.value);
            if (next) set({ paper: next, templateId: null });
          }}
        >
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value={CUSTOM}>{t('wall.paper.custom')}</option>
        </select>
      </label>
      {asCustom ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Mm label={t('wall.paper.width')} value={w} min={CUSTOM_MM.min} max={CUSTOM_MM.max} onCommit={(mm) => setCustom(mm, h)} />
          <Mm label={t('wall.paper.height')} value={h} min={CUSTOM_MM.min} max={CUSTOM_MM.max} onCommit={(mm) => setCustom(w, mm)} />
        </div>
      ) : null}
      <p className="m-0 mt-1 text-xs text-sky-300/80">{t('wall.paper.dimensions', { w: Math.round(w), h: Math.round(h) })}</p>

      <label className="mt-3 block text-xs text-sky-200">
        {t('wall.paper.orientation')}
        <select className={field} value={sheet.orientation ?? 'landscape'} onChange={(e) => set({ orientation: e.target.value === 'portrait' ? 'portrait' : 'landscape', templateId: null })}>
          <option value="landscape">{t('wall.paper.landscape')}</option>
          <option value="portrait">{t('wall.paper.portrait')}</option>
        </select>
      </label>

      <label className="mt-3 block text-xs text-sky-200">
        {t('wall.paper.titleBlock')}
        <select className={field} value={frame.titleBlock} onChange={(e) => setFrame({ ...frame, titleBlock: e.target.value === 'right' ? 'right' : 'bottom-right' })}>
          <option value="bottom-right">{t('wall.paper.tbBottom')}</option>
          <option value="right">{t('wall.paper.tbStrip')}</option>
        </select>
      </label>

      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="p-0 text-sm text-sky-200">{t('wall.paper.margins')}</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {SIDES.map((side) => (
            <Mm key={side} label={t(SIDE_KEYS[side])} value={frame.margins[side]} min={0} max={50} onCommit={(mm) => setFrame({ ...frame, margins: { ...frame.margins, [side]: mm } })} />
          ))}
        </div>
      </fieldset>
      {problem ? (
        <p role="alert" className="m-0 mt-2 text-xs leading-relaxed text-amber-200">
          {t('wall.paper.noRoom', { fw: Math.round(problem.frame.w), fh: Math.round(problem.frame.h), tw: problem.titleBlock.w, th: problem.titleBlock.h })}
        </p>
      ) : null}
      <button type="button" className={`${quiet} mt-2`} onClick={() => setFrame(DEFAULT_FRAME)}>{t('wall.paper.resetFrame')}</button>

      <div className="mt-4 border-t border-sky-300/20 pt-3">
        <label className="block text-xs text-sky-200">
          {t('wall.paper.saveName')}
          <input data-owns-keys className={field} value={saving} onChange={(e) => setSaving(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveSheetTemplate(sheet.id, saving)) setSaving(''); }} />
        </label>
        <button type="button" className={`${quiet} mt-2`} disabled={!saving.trim()} onClick={() => { if (saveSheetTemplate(sheet.id, saving)) setSaving(''); }}>{t('wall.paper.save')}</button>
      </div>

      {series ? (
        <label className="mt-4 block text-xs text-sky-200">
          {t('wall.paper.series', { series: t(SERIES_KEYS[series]) })}
          <select className={field} value={chosen?.[series] ?? ''} onChange={(e) => setSeriesTemplate(series, e.target.value || null)}>
            <option value="">{t('wall.paper.seriesNone')}</option>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
          </select>
        </label>
      ) : null}
      <button type="button" className={`${quiet} mt-4`} onClick={onClose}>{t('wall.tb.done')}</button>
    </aside>
  );
}
