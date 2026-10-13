/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One sheet stepped into, in place on the Wall. Click a drawing to choose it;
 * the wheel inside a plan raises or lowers its cut, inside a section or an
 * elevation it sees further or less far. Beside the sheet: the chosen
 * drawing's control, the scale of a plan sheet, the few large tools for
 * adding information, and for a sheet of sections the tray of others to swap
 * in. Esc hangs it back.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { sheetGroup, type ModelExtent } from '@/project/drawing-set';
import { activateDocumentTab } from '@/project/open-view';
import { useProjectStore } from '@/project/project-store';
import type { SectionProposal } from '@/project/section-proposals';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { useSheetContent } from '../sheets/useSheetContent';
import { SectionTray } from './SectionTray';
import { CutHeightControl, DepthControl } from './ViewControls';
import { WallSheet } from './WallSheet';
import { ScaleChips } from './WallGrid';
import { drawOnView, nudgeCutHeight, nudgeViewDepth, WALL_TOOLS } from './wall-actions';

interface SteppedSheetProps {
  sheet: ProjectSheet;
  extent: ModelExtent | null;
  proposals: readonly SectionProposal[];
  onBack: () => void;
}

export function SteppedSheet({ sheet, extent, proposals, onBack }: SteppedSheetProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const sheetContent = useSheetContent(sheet);
  const host = useRef<HTMLDivElement>(null);
  const paperRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const viewports = useMemo(() => sheet.viewports ?? [], [sheet.viewports]);
  const [chosen, setChosen] = useState<string | null>(null);
  const slot = viewports.find((v) => v.id === chosen) ?? viewports[0] ?? null;
  const view = views.find((v) => v.id === slot?.viewId) ?? null;
  const group = sheetGroup(sheet);

  // The sheet as large as the space allows.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const paper = paperOf(sheet);
      setWidth(Math.max(200, Math.min(w - 32, ((h - 32) * paper.w) / paper.h)));
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const viewportAt = (clientX: number, clientY: number): SheetViewport | null => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const k = rect.width / paperOf(sheet).w;
    const p = { x: (clientX - rect.left) / k, y: (clientY - rect.top) / k };
    return [...viewports].reverse().find((vp) => {
      const box = sheetContent.boxOf(vp);
      return Math.abs(p.x - vp.x) <= box.width / 2 && Math.abs(p.y - vp.y) <= box.height / 2;
    }) ?? null;
  };

  // The wheel inside a drawing moves its cut or its depth; a notch is one step.
  useEffect(() => {
    const el = paperRef.current?.parentElement;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const vp = viewportAt(e.clientX, e.clientY);
      const target = vp ? useProjectStore.getState().views.find((v) => v.id === vp.viewId) : null;
      if (!vp || !target) return;
      e.preventDefault();
      setChosen(vp.id);
      const steps = e.deltaY < 0 ? 1 : -1;
      if (target.kind === 'plan') nudgeCutHeight(target.id, steps);
      else if (target.kind === 'section' || target.kind === 'elevation') nudgeViewDepth(target.id, steps);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-8 pt-5 text-sky-100">
        <button type="button" className="text-sky-400 hover:text-sky-300" onClick={onBack}>{t('wall.back')}</button>
        <span className="text-sky-200/50">/</span>
        <span className="font-semibold text-white">{sheet.number} {sheet.name}</span>
        <kbd className="rounded border border-sky-300/40 px-1.5 text-xs text-sky-200/80">Esc</kbd>
        <span className="flex-1" />
        {group === 'plans' ? <ScaleChips group="plans" extent={extent} /> : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-6 px-8 py-4">
        <aside className="flex w-56 shrink-0 flex-col gap-8">
          {view?.kind === 'plan' ? <CutHeightControl view={view} /> : null}
          {view?.kind === 'section' || view?.kind === 'elevation' ? <DepthControl view={view} /> : null}
          {view ? (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-sky-200/70">{t('wall.tools', { name: view.name })}</span>
              <div className="grid grid-cols-2 gap-2">
                {WALL_TOOLS.map((tool) => (
                  <button key={tool.command} type="button" onClick={() => drawOnView(view.id, tool.command)} className="rounded-lg border border-sky-300/30 px-3 py-3 text-sm text-sky-50 hover:border-sky-300 hover:bg-sky-500/10">
                    {t(tool.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <button type="button" className="mt-auto self-start text-sm text-sky-300 underline-offset-4 hover:underline" onClick={() => activateDocumentTab(sheet.id)}>{t('wall.editSheet')}</button>
        </aside>
        <div ref={host} className="flex min-w-0 flex-1 items-center justify-center">
          <button
            type="button"
            aria-label={t('wall.chooseDrawing')}
            className="cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            onClick={(e) => {
              const vp = viewportAt(e.clientX, e.clientY);
              if (vp) setChosen(vp.id);
            }}
            onKeyDown={(e) => {
              // Arrows walk the drawings on the sheet.
              if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || viewports.length === 0) return;
              const at = Math.max(0, viewports.findIndex((v) => v.id === slot?.id));
              setChosen(viewports[(at + (e.key === 'ArrowRight' ? 1 : viewports.length - 1)) % viewports.length].id);
            }}
          >
            <WallSheet ref={paperRef} sheet={sheet} width={width} selectedViewportId={slot?.id ?? null} sheetContent={sheetContent} />
          </button>
        </div>
      </div>
      {group === 'sections' ? (
        <div className="flex shrink-0 justify-center px-8 pb-6">
          <SectionTray sheet={sheet} slotId={slot?.id ?? null} proposals={proposals} />
        </div>
      ) : null}
    </div>
  );
}
