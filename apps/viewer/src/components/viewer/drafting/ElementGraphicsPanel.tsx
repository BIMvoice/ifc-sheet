/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Graphics for this element…" (#32): the overrides panel of the elements selected in the drawing in front. Colour, the line weight of
 * the cut and of what is seen beyond it, line style, fill and the hatch on the cut; a field left as set keeps what the category gives.
 * Every change is ONE undo step (`element-graphics-actions.ts`) and applies to every selected element. The bar of the selected
 * annotation (`SelectionBar`) is the pattern.
 */

import { useEffect, useRef, useState } from 'react';
import type { CategoryLineWeight, ElementGraphics, ElementLineStyle } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { builtInPatterns } from '@/drafting/hatch/library';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { resetElementGraphics, setElementGraphics } from '@/project/element-graphics-actions';

const WEIGHTS: readonly CategoryLineWeight[] = ['heavy', 'medium', 'light', 'hairline'];
const SELECT = 'h-7 w-full rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';
const LABEL = 'flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-400';

/** A colour field that changes the drawing when the picker is closed, not on every step of the drag: one undo step per choice. */
function ColourField({ label, value, clear, onCommit }: { label: string; value: string | undefined; clear: string; onCommit: (colour: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  const [draft, setDraft] = useState(value ?? '#808080');
  useEffect(() => setDraft(value ?? '#808080'), [value]);
  useEffect(() => {
    const input = ref.current;
    if (!input) return undefined;
    const done = () => latest.current(input.value);
    input.addEventListener('change', done);
    return () => input.removeEventListener('change', done);
  }, []);
  return (
    <div className={LABEL}>
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input ref={ref} type="color" aria-label={label} className="h-7 w-10 cursor-pointer rounded-sm border border-zinc-300 bg-transparent p-0 dark:border-zinc-700" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <span className="flex-1 tabular-nums text-zinc-900 dark:text-zinc-100">{value ?? clear}</span>
        {value ? <button type="button" aria-label={`${label}: ${clear}`} className="h-7 rounded-sm px-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onCommit(undefined)}>{clear}</button> : null}
      </span>
    </div>
  );
}

interface Props {
  viewId: string;
  /** The selected elements: GlobalId and name. */
  elements: readonly { globalId: string; label: string }[];
  /** What the first of them draws with now (its override), the panel's values. */
  current: ElementGraphics | undefined;
  extraPatterns: readonly HatchPattern[];
  onClose: () => void;
}

export function ElementGraphicsPanel({ viewId, elements, current, extraPatterns, onClose }: Props) {
  const { t } = useTranslation();
  const ids = elements.map((e) => e.globalId);
  const about = new Map(elements.map((e) => [e.globalId, e.label]));
  const set = (patch: Partial<ElementGraphics>) => setElementGraphics(viewId, ids, patch, about);
  const weightLabel = (w: CategoryLineWeight) => t(`viewGraphics.weight.${w}` as TranslationKey);
  const patterns = [...new Set([...builtInPatterns(), ...extraPatterns].map((p) => p.name))].sort();
  return (
    <dialog
      open data-element-graphics-panel aria-label={t('elgfx.panel.title', { count: elements.length })}
      className="absolute left-2 right-auto top-14 z-20 m-0 flex w-72 max-w-[calc(100%-1rem)] cursor-default flex-col gap-2 rounded-md border border-zinc-300 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
    >
      <p className="m-0 text-sm font-medium">{t('elgfx.panel.title', { count: elements.length })}</p>
      <p className="m-0 truncate text-xs text-zinc-600 dark:text-zinc-400">{elements.length === 1 ? elements[0].label : t('elgfx.panel.hint')}</p>
      <ColourField label={t('elgfx.lineColour')} value={current?.lineColor} clear={t('elgfx.colourClear')} onCommit={(lineColor) => set({ lineColor })} />
      <ColourField label={t('elgfx.fillColour')} value={current?.fillColor} clear={t('elgfx.colourClear')} onCommit={(fillColor) => set({ fillColor })} />
      <label className={LABEL}>
        {t('elgfx.cutWeight')}
        <select className={SELECT} value={current?.cutWeight ?? ''} onChange={(e) => set({ cutWeight: (e.target.value || undefined) as CategoryLineWeight | undefined })}>
          <option value="">{t('elgfx.weightSet')}</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{weightLabel(w)}</option>)}
        </select>
      </label>
      <label className={LABEL}>
        {t('elgfx.projectionWeight')}
        <select className={SELECT} value={current?.projectionWeight ?? ''} onChange={(e) => set({ projectionWeight: (e.target.value || undefined) as CategoryLineWeight | undefined })}>
          <option value="">{t('elgfx.weightSet')}</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{weightLabel(w)}</option>)}
        </select>
      </label>
      <label className={LABEL}>
        {t('elgfx.lineStyle')}
        <select className={SELECT} value={current?.lineStyle ?? ''} onChange={(e) => set({ lineStyle: (e.target.value || undefined) as ElementLineStyle | undefined })}>
          <option value="">{t('elgfx.style.default')}</option>
          <option value="solid">{t('elgfx.style.solid')}</option>
          <option value="dashed">{t('elgfx.style.dashed')}</option>
        </select>
      </label>
      <label className={LABEL}>
        {t('elgfx.cutHatch')}
        <select className={SELECT} value={current?.cutHatch ?? ''} onChange={(e) => set({ cutHatch: e.target.value || undefined })}>
          <option value="">{t('elgfx.hatchSet')}</option>
          {patterns.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <div className="flex justify-between gap-2">
        <button type="button" className="h-7 rounded-sm px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => resetElementGraphics(viewId, ids)}>{t('elgfx.reset')}</button>
        <button type="button" className="h-7 rounded-sm px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClose}>{t('elgfx.close')}</button>
      </div>
    </dialog>
  );
}
