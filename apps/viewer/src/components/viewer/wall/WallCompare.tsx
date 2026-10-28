/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two sheets side by side to cross-check them, a plan and its section for one (#498). Both hang at one zoom, so a millimetre
 * of paper is as wide on the left as on the right (100 % is the paper size). The Wall stays mounted underneath and its zoom is
 * never written here, so Esc, or the close button, finds it as it was.
 */

import { ArrowLeftRight, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { clampZoom, PX_PER_MM, stepZoom } from '@/wall/wall-zoom';
import { cancelPick, closeCompare, setCompareSide, setPanTogether, swapCompare, useWallCompare } from '@/wall/wall-compare';
import { WallSheet } from './WallSheet';

const button = 'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-sky-100 hover:bg-sky-300/15 focus-visible:ring-2 focus-visible:ring-sky-400';
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const label = (s: ProjectSheet) => `${s.number} ${s.name}`;

export function WallCompare() {
  const pair = useWallCompare((s) => s.pair);
  const pick = useWallCompare((s) => s.pick);
  const sheets = useProjectStore((s) => s.sheets);
  const left = pair ? sheets.find((s) => s.id === pair[0]) : undefined;
  const right = pair ? sheets.find((s) => s.id === pair[1]) : undefined;
  // A sheet taken away from under the comparison ends it: there is no second sheet to show.
  useEffect(() => {
    if (pair && (!left || !right)) closeCompare();
  }, [pair, left, right]);
  if (pair && left && right) return <ComparePanes left={left} right={right} />;
  const picked = pick ? sheets.find((s) => s.id === pick) : undefined;
  return picked ? <Picking name={label(picked)} /> : null;
}

function Picking({ name }: { name: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) cancelPick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <output className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-sky-300/30 bg-[#061a36]/95 px-4 py-2 text-sm text-sky-100 shadow-lg">
      <span>{t('wall.compare.picking', { name })}</span>
      <button type="button" className="rounded border border-sky-300/30 px-2 py-0.5 text-xs hover:border-sky-300/70 focus-visible:ring-2 focus-visible:ring-sky-400" onClick={cancelPick}>{t('wall.compare.cancel')}</button>
    </output>
  );
}

function ComparePanes({ left, right }: { left: ProjectSheet; right: ProjectSheet }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const together = useWallCompare((s) => s.together);
  const [zoom, setZoom] = useState(1);
  const panes = useRef<[HTMLElement | null, HTMLElement | null]>([null, null]);
  const last = useRef<[{ x: number; y: number }, { x: number; y: number }]>([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // The control that opened it gets focus back when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, []);
  // Keys belong to the dialog: Esc closes, Tab and Shift+Tab cycle inside it (the same trap as the print preview).
  useEffect(() => {
    const pull = (e: FocusEvent) => {
      if (dialog.current && e.target instanceof Node && !dialog.current.contains(e.target)) closeRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const stops = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeCompare();
    };
    document.addEventListener('focusin', pull);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', pull);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // A pane panned moves the other by the same amount (not to the same offset: the sheets may be panned apart, or differ in size).
  const onScroll = (side: 0 | 1) => {
    const el = panes.current[side];
    const other = panes.current[1 - side];
    if (!el) return;
    const dx = el.scrollLeft - last.current[side].x;
    const dy = el.scrollTop - last.current[side].y;
    last.current[side] = { x: el.scrollLeft, y: el.scrollTop };
    if (!together || !other || (dx === 0 && dy === 0)) return;
    other.scrollLeft += dx;
    other.scrollTop += dy;
    last.current[1 - side] = { x: other.scrollLeft, y: other.scrollTop };
  };

  const fit = () => {
    const sizes = panes.current.map((p, i) => ({ el: p, paper: paperOf(i === 0 ? left : right) }));
    const fits = sizes.filter((s) => s.el && s.el.clientWidth > 0 && s.el.clientHeight > 0).map((s) => Math.min((s.el!.clientWidth - 32) / (s.paper.w * PX_PER_MM), (s.el!.clientHeight - 32) / (s.paper.h * PX_PER_MM)));
    if (fits.length > 0) setZoom(clampZoom(Math.min(...fits)));
  };

  const pane = (side: 0 | 1, sheet: ProjectSheet) => (
    <section
      key={side}
      ref={(el) => { panes.current[side] = el; }}
      // A scrolling pane takes focus so the arrow keys pan it.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={t(side === 0 ? 'wall.compare.paneLeft' : 'wall.compare.paneRight', { name: label(sheet) })}
      data-compare-pane={side}
      onScroll={() => onScroll(side)}
      className="min-h-0 min-w-0 flex-1 overflow-auto rounded-sm border border-sky-300/20 p-4 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <WallSheet sheet={sheet} width={paperOf(sheet).w * PX_PER_MM * zoom} pinned={false} />
    </section>
  );
  const select = (side: 0 | 1, sheet: ProjectSheet) => (
    <select
      aria-label={t(side === 0 ? 'wall.compare.left' : 'wall.compare.right')}
      value={sheet.id}
      onChange={(e) => setCompareSide(side, e.target.value)}
      className="max-w-56 rounded border border-sky-300/30 bg-[#061a36] px-2 py-1 text-xs text-sky-100 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {sheets.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
    </select>
  );

  return (
    <dialog ref={dialog} open aria-modal="true" aria-label={t('wall.compare.title')} data-owns-keys data-wall-compare className="absolute inset-0 z-30 m-0 flex h-full w-full max-w-none flex-col gap-3 border-0 bg-[#061a36] p-4 text-sky-50">
      <div className="flex flex-wrap items-center gap-3">
        {select(0, left)}
        <button type="button" className={button} aria-label={t('wall.compare.swap')} title={t('wall.compare.swap')} onClick={swapCompare}><ArrowLeftRight className="size-4" /></button>
        {select(1, right)}
        <label className="flex items-center gap-1.5 text-xs text-sky-100">
          <input type="checkbox" checked={together} onChange={(e) => setPanTogether(e.target.checked)} />
          {t('wall.compare.together')}
        </label>
        <fieldset aria-label={t('wall.compare.zoom')} className="m-0 flex min-w-0 items-center gap-0.5 border-0 p-0">
          <button type="button" className={button} aria-label={t('wall.zoom.out')} title={t('wall.zoom.out')} onClick={() => setZoom((z) => stepZoom(z, -1))}><Minus className="size-4" /></button>
          <button type="button" data-compare-zoom className={`${button} w-14 tabular-nums`} aria-label={t('wall.zoom.trueSize')} title={t('wall.zoom.trueSize')} onClick={() => setZoom(1)}>{t('wall.zoom.percent', { percent: Math.round(zoom * 100) })}</button>
          <button type="button" className={button} aria-label={t('wall.zoom.in')} title={t('wall.zoom.in')} onClick={() => setZoom((z) => stepZoom(z, 1))}><Plus className="size-4" /></button>
          <button type="button" className={button} onClick={fit}>{t('wall.fit')}</button>
        </fieldset>
        <button ref={closeRef} type="button" className={`${button} ml-auto`} aria-label={t('wall.compare.close')} title={t('wall.compare.close')} onClick={closeCompare}><X className="size-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        {pane(0, left)}
        {pane(1, right)}
      </div>
    </dialog>
  );
}
