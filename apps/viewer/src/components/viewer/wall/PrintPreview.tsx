/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheet at paper size before it is printed. The paper is the very SVG the
 * exports read (`sheetSvgText`), shown as an image so nothing here can reach
 * the sheet itself; the 1 m reference bars and the out-of-frame highlights are
 * a second SVG laid over it in the same millimetres, so they appear here only
 * and never in a PDF, SVG or DXF. 100% is 1 mm of paper per CSS millimetre.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import { draftsOfView } from '@/drafting/draft-store';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { draftItem, fitProblems, referenceBars, sheetRegions, viewportRect, type SheetItem } from '../sheets/print-check';
import { sheetSvgText } from '../sheets/sheet-export';
import type { SheetContent } from '../sheets/useSheetContent';

/** CSS defines 96 px to the inch: this many px to a CSS millimetre. */
const PX_PER_MM = 96 / 25.4;
const ZOOM = { min: 0.1, max: 8 } as const;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface PrintPreviewProps {
  sheet: ProjectSheet;
  /** The live sheet SVG the exports read. */
  paper: SVGSVGElement;
  sheetContent: SheetContent;
  onClose: () => void;
}

const REASON_KEY = { frame: 'printPreview.reason.frame', titleBlock: 'printPreview.reason.titleBlock', area: 'printPreview.reason.area' } as const;
const button = 'rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-800 hover:border-zinc-500';

export function PrintPreview({ sheet, paper, sheetContent, onClose }: PrintPreviewProps) {
  const { t } = useTranslation();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const size = paperOf(sheet);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitted, setFitted] = useState(1);
  const drafts = useProjectStore((s) => s.drafts);

  // A snapshot of the export's own text, taken when the preview opens.
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheetSvgText(paper, sheet))}`, [paper, sheet]);

  const placedDocs = useProjectStore((s) => s.schedules);
  const legends = useProjectStore((s) => s.legends);
  const civilDrawings = useProjectStore((s) => s.civilDrawings);

  const { bars, problems } = useMemo(() => {
    // Every viewport is checked by its box; only a drawn view (not a schedule, legend or road drawing) gets a 1 m bar.
    const docName = (id: string) => [...(placedDocs ?? []), ...(legends ?? []), ...(civilDrawings ?? [])].find((d) => d.id === id)?.name ?? '?';
    const all = (sheet.viewports ?? []).map((vp) => {
      const c = sheetContent.content(vp);
      const drawn = !c.schedule && !c.civil && !c.legend;
      return { id: vp.id, scale: vp.scale, box: viewportRect(vp, sheetContent.boxOf(vp)), drawn, name: drawn ? c.view?.name ?? '?' : docName(vp.viewId) };
    });
    const boxes = all.filter((b) => b.drawn);
    const items: SheetItem[] = [
      ...all.map((b) => ({ id: b.id, kind: 'viewport' as const, name: b.drawn ? t('printPreview.item.viewport', { name: b.name, scale: b.scale }) : b.name, box: b.box })),
      ...draftsOfView(sheet.id, drafts).map((d) => {
        const item = draftItem(d);
        return { ...item, name: t('printPreview.item.draft', { kind: item.name }) };
      }),
    ];
    return { bars: referenceBars(boxes).map((b, i) => ({ ...b, name: boxes[i].name })), problems: fitProblems(items, sheetRegions(sheet, { w: size.w, h: size.h })) };
  }, [sheet, sheetContent, drafts, placedDocs, legends, civilDrawings, t, size.w, size.h]);

  // Fit the whole paper in the stage.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setFitted(Math.max(ZOOM.min, Math.min((width - 32) / (size.w * PX_PER_MM), (height - 32) / (size.h * PX_PER_MM))));
  }, [size.w, size.h]);
  const k = zoom === 'fit' ? fitted : zoom;
  const step = (f: number): void => setZoom(Math.min(ZOOM.max, Math.max(ZOOM.min, k * f)));

  // Keys belong to the dialog: focus goes in, Tab stays in, Esc closes, and focus is given back.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>('[data-close]')?.focus();
    const pull = (e: FocusEvent): void => {
      if (dialog.current && e.target instanceof Node && !dialog.current.contains(e.target)) dialog.current.querySelector<HTMLElement>('[data-close]')?.focus();
    };
    // Window capture, like the sheet's own keys: Esc closes, Tab stays in the dialog.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
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
      }
    };
    document.addEventListener('focusin', pull);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', pull);
      window.removeEventListener('keydown', onKey, true);
      before?.focus();
    };
  }, []);
  const title = t('printPreview.title', { number: sheet.number, name: sheet.name });
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <dialog ref={dialog} open aria-modal="true" aria-label={title} data-owns-keys data-print-preview className="static m-0 flex h-full max-h-full w-full max-w-[1600px] flex-col rounded-lg bg-white text-zinc-900 p-0 shadow-xl">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2">
          <strong className="mr-2">{title}</strong>
          <span className="text-sm text-zinc-600">{t('printPreview.paper', { width: size.w, height: size.h })}</span>
          <span className="flex-1" />
          <button type="button" className={button} onClick={() => step(1 / 1.25)} aria-label={t('printPreview.zoomOut')}>−</button>
          <span className="min-w-16 text-center text-sm tabular-nums" aria-live="polite">{t('printPreview.zoomLevel', { percent: Math.round(k * 100) })}</span>
          <button type="button" className={button} onClick={() => step(1.25)} aria-label={t('printPreview.zoomIn')}>+</button>
          <button type="button" className={button} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>{t('printPreview.fit')}</button>
          <button type="button" className={button} aria-pressed={zoom === 1} onClick={() => setZoom(1)}>{t('printPreview.actual')}</button>
          <button type="button" data-close className={button} onClick={onClose}>{t('printPreview.close')}</button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={stage} className="min-w-0 flex-1 overflow-auto bg-zinc-200 p-4">
            <div className="relative mx-auto bg-white shadow" style={{ width: `${size.w * k}mm`, height: `${size.h * k}mm` }}>
              <img src={src} alt="" className="absolute inset-0 block h-full w-full" draggable={false} />
              <svg data-preview-overlay viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 h-full w-full" aria-hidden>
                {problems.map((p) => (
                  <rect key={p.item.id} data-warning={p.item.id} data-reason={p.reason} x={p.item.box.x} y={p.item.box.y} width={p.item.box.w} height={p.item.box.h} fill="rgba(220,38,38,0.12)" stroke="#dc2626" strokeWidth={0.6} strokeDasharray="3 2" />
                ))}
                {bars.map((b) => (
                  <g key={b.viewportId} data-ref-bar={b.viewportId} data-scale={b.scale}>
                    <rect data-bar-length-mm={b.lengthMm} x={b.x} y={b.y - 0.6} width={b.lengthMm} height={1.2} fill="#0369a1" />
                    <line x1={b.x} y1={b.y - 2} x2={b.x} y2={b.y + 2} stroke="#0369a1" strokeWidth={0.3} />
                    <line x1={b.x + b.lengthMm} y1={b.y - 2} x2={b.x + b.lengthMm} y2={b.y + 2} stroke="#0369a1" strokeWidth={0.3} />
                    <text x={b.x + b.lengthMm + 1.5} y={b.y + 1} fontSize={2.5} fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#0369a1">{t('printPreview.bar', { scale: b.scale })}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
          <aside className="w-72 shrink-0 overflow-auto border-l border-zinc-200 p-4 text-sm" aria-label={t('printPreview.warnings')}>
            <h2 className="mb-2 font-semibold">{t('printPreview.warnings')}</h2>
            {problems.length === 0 ? <p data-no-warnings>{t('printPreview.clean')}</p> : (
              <ul className="list-disc space-y-1 pl-5" data-warnings>
                {problems.map((p) => <li key={p.item.id}>{t(REASON_KEY[p.reason], { item: p.item.name })}</li>)}
              </ul>
            )}
            <h2 className="mb-2 mt-4 font-semibold">{t('printPreview.bars')}</h2>
            <ul className="space-y-1">
              {bars.map((b) => <li key={b.viewportId}>{b.name}: {t('printPreview.bar', { scale: b.scale })}, {t('printPreview.barLength', { mm: +b.lengthMm.toFixed(2) })}</li>)}
            </ul>
            <p className="mt-4 text-zinc-600">{t('printPreview.scaleNote')}</p>
          </aside>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
