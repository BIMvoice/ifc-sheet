/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One sheet stepped into, in place on the Wall (concept A, direction #20).
 * The rail at the left holds six large tools that only add information; the
 * card at the right says what the chosen tool does, or holds the chosen
 * drawing's one control. Picking a tool brings that drawing forward on white
 * paper to work on; Esc ends the tool, Esc again goes back to the sheet, and
 * once more hangs the sheet back on the wall.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { runningCommand, useDraftingSession } from '@/drafting/session';
import { sheetGroup, type ModelExtent } from '@/project/drawing-set';
import { groundPlan, hangView } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import type { SectionProposal } from '@/project/section-proposals';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { DraftingView } from '../drafting/DraftingView';
import { useSheetContent } from '../sheets/useSheetContent';
import { AddDrawing } from './AddDrawing';
import { InfoCard } from './InfoCard';
import { SectionTray } from './SectionTray';
import { ToolRail } from './ToolRail';
import { WallSheet } from './WallSheet';
import { ScaleChips } from './WallGrid';
import { nudgeCutHeight, nudgeViewDepth, startWhenAttached } from './wall-actions';

interface SteppedSheetProps {
  sheet: ProjectSheet;
  extent: ModelExtent | null;
  proposals: readonly SectionProposal[];
  onBack: () => void;
  /** Step into another sheet (a drawing just added landed there). */
  onStep: (sheetId: string) => void;
  onMore: () => void;
}

export function SteppedSheet({ sheet, extent, proposals, onBack, onStep, onMore }: SteppedSheetProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const sheetContent = useSheetContent(sheet);
  const host = useRef<HTMLDivElement>(null);
  const paperRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const viewports = useMemo(() => sheet.viewports ?? [], [sheet.viewports]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const cancelStart = useRef<() => void>(() => {});
  const slot = viewports.find((v) => v.id === chosen) ?? viewports[0] ?? null;
  const view = views.find((v) => v.id === slot?.viewId) ?? null;
  const focus = views.find((v) => v.id === focusId);
  const focusView = focus && focus.kind !== '3d' ? focus : null;
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
  }, [sheet, focusId]);

  // A tool ends (Esc, or it finished): the rail lets go of it; the drawing stays forward.
  const commandId = useDraftingSession((s) => s.commandId);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    // Only a command that ran and ended lets go; before it starts there is none either.
    if (commandId !== null) ran.current = commandId;
    else if (ran.current !== null) {
      ran.current = null;
      setTool(null);
    }
  }, [commandId]);
  useEffect(() => () => cancelStart.current(), []);

  // Drawings made while inside (a section line drawn) hang on the set at once.
  const known = useRef(new Set(views.map((v) => v.id)));
  useEffect(() => {
    if (!extent) return;
    for (const v of views) {
      if (known.current.has(v.id)) continue;
      known.current.add(v.id);
      if (v.kind === 'section') hangView(v.id, extent);
    }
  }, [views, extent]);

  // Esc, outermost first to let go: the running tool or selection (the drawing's own), the chooser, the drawing, the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (focusId && (runningCommand() || useDraftingSession.getState().selection.size > 0)) return;
      if (adding) setAdding(false);
      else if (focusId) {
        setFocusId(null);
        setTool(null);
      } else onBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onBack, focusId, adding]);

  const startTool = (command: string): void => {
    // A section line is drawn on a plan: the chosen one, else the lowest.
    const target = command === 'sectionline' && view?.kind !== 'plan' ? groundPlan(views) : view;
    if (!target || target.kind === '3d') return;
    cancelStart.current();
    ran.current = null;
    setAdding(false);
    setTool(command);
    setFocusId(target.id);
    cancelStart.current = startWhenAttached(target.id, command);
  };

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

  // The wheel inside a drawing on the sheet moves its cut or its depth; a notch is one step.
  useEffect(() => {
    const el = paperRef.current?.parentElement;
    if (!el || focusId) return;
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
      <div className="flex shrink-0 items-center gap-3 px-6 pb-2 pt-4 text-sky-100">
        <button type="button" className="text-cyan-400 hover:text-cyan-300" onClick={onBack}>{t('wall.back')}</button>
        <span className="text-sky-200/50">/</span>
        <span className="font-semibold text-white">{sheet.number} {sheet.name}</span>
        {focusView ? <><span className="text-sky-200/50">/</span><span className="text-white">{focusView.name}</span></> : null}
        <kbd className="rounded border border-sky-300/40 px-1.5 text-xs text-sky-200/80">Esc</kbd>
        <span className="flex-1" />
        {group === 'plans' && !focusView ? <ScaleChips group="plans" extent={extent} /> : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-4">
        <ToolRail active={tool} onTool={startTool} adding={adding} onAdd={() => setAdding((a) => !a)} onMore={onMore} />
        <main className="relative min-w-0 flex-1">
          {focusView ? (
            <div className="absolute inset-0 overflow-hidden rounded-md bg-white text-zinc-900">
              <DraftingView key={focusView.id} view={focusView} bare />
            </div>
          ) : (
            <div ref={host} className="flex h-full items-center justify-start">
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
          )}
          <div className="pointer-events-none absolute right-3 top-3 [&>*]:pointer-events-auto">
            <InfoCard tool={tool} view={focusView ? null : view} />
          </div>
          {adding ? (
            <div className="absolute inset-x-3 bottom-3 flex justify-center">
              <AddDrawing
                onClose={() => setAdding(false)}
                onSection={() => startTool('sectionline')}
                onView={(viewId) => {
                  setAdding(false);
                  const landed = extent ? hangView(viewId, extent) : null;
                  if (landed && landed !== sheet.id) onStep(landed);
                }}
              />
            </div>
          ) : null}
        </main>
      </div>
      {!focusView && group === 'sections' ? (
        <div className="flex shrink-0 justify-center px-6 pb-3">
          <SectionTray sheet={sheet} slotId={slot?.id ?? null} proposals={proposals} />
        </div>
      ) : null}
      {!focusView ? (
        <footer className="flex shrink-0 items-baseline gap-3 border-t border-zinc-200 bg-white px-6 py-3 text-sm text-zinc-700">
          <strong className="text-zinc-900">{t('wall.sheetHint.title')}</strong>
          <span>{t('wall.sheetHint.body')}</span>
        </footer>
      ) : null}
    </div>
  );
}
