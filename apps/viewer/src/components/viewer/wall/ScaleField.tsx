/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The scale of the drawing chosen on a sheet: one of the offered scales, or
 * any other typed in. When the drawing at that scale is larger than the
 * sheet's drawing area it says so, and offers the most detailed scale at
 * which it fits.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { detailedScaleThatFits, overrun } from '@/project/drawing-set';
import { updateProjectView } from '@/project/project-store';
import { SHEET_SCALES, updateViewport, viewportBox } from '@/project/sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-base text-white';
const quiet = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70';
const OTHER = 'other';
/** A typed scale is a whole denominator up to this (1:100 000, a regional plan). */
export const MAX_SCALE = 100_000;

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };

interface ScaleFieldProps {
  sheet: ProjectSheet;
  slot: SheetViewport;
  view: ProjectView | undefined;
  /** The chosen drawing's extent, metres; null before it is generated (or for a schedule). */
  bounds: Bounds | null;
}

/** A typed scale denominator ("50", "1:50", "1 : 50"), or null when it is not a whole positive number within range. */
export function parseScale(text: string): number | null {
  const m = /^\s*(?:1\s*:\s*)?(\d+)\s*$/.exec(text);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_SCALE ? n : null;
}

export function ScaleField({ sheet, slot, view, bounds }: ScaleFieldProps) {
  const { t } = useTranslation();
  const offered = (SHEET_SCALES as readonly number[]).includes(slot.scale);
  const [typing, setTyping] = useState(false);
  const [bad, setBad] = useState(false);

  const apply = (scale: number): void => {
    // The box fits the drawing again at the new scale; the view's annotation sizes follow it.
    updateViewport(sheet.id, slot.id, { scale, width: 0, height: 0 });
    if (view) updateProjectView(view.id, { scale });
  };
  const box = viewportBox(slot, bounds);
  const area = bounds ? overrun(box, sheet) : null;
  const fits = area && bounds ? detailedScaleThatFits(bounds, sheet) : null;

  return (
    <div className="mt-3">
      <label className="block text-sm text-sky-200">
        {t('wall.vp.scale')}
        <select
          className={field}
          value={typing ? OTHER : slot.scale}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setTyping(true);
              return;
            }
            setTyping(false);
            apply(Number(e.target.value));
          }}
        >
          {offered ? null : <option value={slot.scale}>{`1 : ${slot.scale}`}</option>}
          {SHEET_SCALES.map((s) => <option key={s} value={s}>{`1 : ${s}`}</option>)}
          <option value={OTHER}>{t('wall.vp.scaleOther')}</option>
        </select>
      </label>
      {typing ? (
        <label className="mt-2 block text-sm text-sky-200">
          {t('wall.vp.scaleTyped')}
          <input
            // The field is what "Other…" asked for: it takes the keys at once.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="numeric"
            className={field}
            placeholder="1 : 33"
            aria-invalid={bad}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTyping(false);
              if (e.key !== 'Enter') return;
              const scale = parseScale((e.target as HTMLInputElement).value);
              setBad(scale === null);
              if (scale !== null) {
                apply(scale);
                setTyping(false);
              }
            }}
          />
          {bad ? <span role="alert" className="mt-1 block text-xs text-amber-300">{t('wall.vp.scaleBad', { max: MAX_SCALE })}</span> : null}
        </label>
      ) : null}
      {area ? (
        <output className="mt-2 block rounded-md border border-amber-300/40 bg-amber-300/10 p-2 text-sm text-amber-100">
          {t('wall.vp.overrun', { scale: slot.scale, w: Math.round(box.width), h: Math.round(box.height), aw: Math.round(area.w), ah: Math.round(area.h) })}
          {fits ? <button type="button" className={`${quiet} mt-2 block`} onClick={() => apply(fits)}>{t('wall.vp.useScale', { scale: fits })}</button> : null}
        </output>
      ) : null}
    </div>
  );
}
