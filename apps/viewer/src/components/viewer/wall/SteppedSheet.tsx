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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { runningCommand, useDraftingSession } from '@/drafting/session';
import { setPlacing, useReviewUi } from '@/review/ui-store';
import { sheetGroup, type ModelExtent } from '@/project/drawing-set';
import { groundPlan, hangView } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import type { SectionProposal } from '@/project/section-proposals';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { DraftingView } from '../drafting/DraftingView';
import { exportSheetDxf } from '../sheets/sheet-dxf';
import { printSheet } from '../sheets/sheet-export';
import { useSheetContent } from '../sheets/useSheetContent';
import { AddDrawing } from './AddDrawing';
import { InfoCard } from './InfoCard';
import { PrintPreview } from './PrintPreview';
import { SectionTray } from './SectionTray';
import { ToolRail } from './ToolRail';
import { ScaleChips } from './WallGrid';
import { SheetCanvas } from './SheetCanvas';
import { RevisionsCard } from './RevisionsCard';
import { TitleBlockCard } from './TitleBlockForm';
import { PaperCard } from './PaperCard';
import { ViewportCard } from './ViewportCard';
import { DRAW_TOOLS, nudgeCutHeight, nudgeViewDepth, startWhenAttached } from './wall-actions';
import { steppedHandlers } from './stepped-keys';
import { useWallKeys } from './wall-key-bus';
import { keyProps } from './wall-key-title';

/** The sheet's way out: printed or saved, at true paper size. */
const issue = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70';

interface SteppedSheetProps {
  sheet: ProjectSheet;
  extent: ModelExtent | null;
  proposals: readonly SectionProposal[];
  onBack: () => void;
  /** The drawing to bring forward on arrival (from the project drawer). */
  initialFocus?: string | null;
  /** Step into another sheet (a drawing just added landed there). */
  onStep: (sheetId: string) => void;
}

export function SteppedSheet({ sheet, extent, proposals, initialFocus = null, onBack, onStep }: SteppedSheetProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const sheets = useProjectStore((s) => s.sheets);
  const sheetContent = useSheetContent(sheet);
  const paperRef = useRef<SVGSVGElement>(null);
  const [fitKey, setFitKey] = useState(0);
  const viewports = useMemo(() => sheet.viewports ?? [], [sheet.viewports]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(initialFocus);
  const [adding, setAdding] = useState(false);
  const [titling, setTitling] = useState(false);
  const [papering, setPapering] = useState(false);
  const [revising, setRevising] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const cancelStart = useRef<() => void>(() => {});
  const slot = viewports.find((v) => v.id === chosen) ?? null;
  const view = views.find((v) => v.id === slot?.viewId) ?? null;
  const focus = views.find((v) => v.id === focusId);
  const focusView = focus && focus.kind !== '3d' ? focus : null;
  const group = sheetGroup(sheet);

  // A tool ends (Esc, or it finished): the rail lets go of it; the drawing stays forward.
  const commenting = useReviewUi((s) => s.placing);
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
      if (v.kind === 'section' || v.detail) hangView(v.id, extent);
    }
  }, [views, extent]);

  // Esc, outermost first to let go: the running tool or selection (the drawing's own), the chooser, the drawing, the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || previewing) return; // the preview, when open, takes its own Esc
      // A panel that keeps its own keys (the tour card) has Esc for itself.
      if (e.target instanceof Element && e.target.closest('[data-owns-keys]')) return;
      // A running tool or a drafted selection lets go first (the drafting keys' own Esc).
      if (runningCommand() || useDraftingSession.getState().selection.size > 0) return;
      // The comment tool lets go first of what is not a drawing tool.
      if (useReviewUi.getState().placing) {
        setPlacing(false);
        return;
      }
      if (adding) setAdding(false);
      else if (titling) setTitling(false);
      else if (papering) setPapering(false);
      else if (revising) setRevising(false);
      else if (focusId) {
        setFocusId(null);
        setTool(null);
      } else if (chosen) setChosen(null);
      else onBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onBack, focusId, chosen, adding, titling, papering, revising, previewing]);

  const startTool = (command: string): void => {
    cancelStart.current();
    ran.current = null;
    setAdding(false);
    // Plain drawing goes on the drawing in front, else on the sheet's paper.
    if (DRAW_TOOLS.some((d) => d.command === command)) {
      setTool(command);
      cancelStart.current = startWhenAttached(focusView?.id ?? sheet.id, command);
      return;
    }
    // A section line is drawn on a plan: the chosen one, else the lowest.
    // A detail marks its area on the drawing in front, else the chosen one, else the lowest plan.
    const target = command === 'sectionline' && view?.kind !== 'plan' ? groundPlan(views) : command === 'detail' ? focusView ?? view ?? groundPlan(views) : view;
    if (!target || target.kind === '3d') return;
    setTool(command);
    setFocusId(target.id);
    cancelStart.current = startWhenAttached(target.id, command);
  };

  /** A tool's one-action twin: run it on the drawing in front (or the chosen one), its note appears in the drawing's command line. */
  const runAll = (command: string): void => {
    cancelStart.current();
    ran.current = null;
    setAdding(false);
    const target = focusView ?? view;
    if (!target || target.kind === '3d') return;
    setTool(null);
    setFocusId(target.id);
    cancelStart.current = startWhenAttached(target.id, command);
  };

  // Choosing a drawing brings its card back in place of the title block's.
  const choose = useCallback((viewportId: string | null): void => {
    setChosen(viewportId);
    if (viewportId) {
      setTitling(false);
      setPapering(false);
      setRevising(false);
    }
  }, []);
  const open = useCallback((vp: SheetViewport): void => {
    const v = useProjectStore.getState().views.find((x) => x.id === vp.viewId);
    if (v && v.kind !== '3d') setFocusId(v.id);
  }, []);
  const nudge = useCallback((vp: SheetViewport, steps: number): void => {
    const v = useProjectStore.getState().views.find((x) => x.id === vp.viewId);
    if (v?.kind === 'plan') nudgeCutHeight(v.id, steps);
    else if (v?.kind === 'section' || v?.kind === 'elevation') nudgeViewDepth(v.id, steps);
  }, []);

  // The sheet's own controls, which the keys share with the buttons; they show with no drawing in front.
  const fit = useCallback(() => setFitKey((k) => k + 1), []);
  const print = useCallback(() => { if (paperRef.current) printSheet(paperRef.current, sheet); }, [sheet]);
  const at = sheets.findIndex((s) => s.id === sheet.id);
  // Stepping to another sheet unmounts this one: never in the middle of a drafting command (a half-drawn
  // polyline would be lost) or with a drawing in front. Then PageUp / PageDown are not on offer and stay the browser's.
  const drafting = commandId !== null || runningCommand() !== null;
  const canStep = !drafting && !focusView;
  const neighbour = (to: number): (() => void) | null => (canStep && sheets[to] ? () => onStep(sheets[to].id) : null);
  useWallKeys(steppedHandlers({
    startTool,
    toggleAdd: () => setAdding((a) => !a),
    fit: focusView ? null : fit,
    print: focusView ? null : print,
    previous: at > 0 ? neighbour(at - 1) : null,
    next: at >= 0 ? neighbour(at + 1) : null,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-6 pb-2 pt-4 text-sky-100">
        <button type="button" className="text-cyan-400 hover:text-cyan-300" onClick={onBack}>{t('wall.back')}</button>
        <span className="text-sky-200/50">/</span>
        <span className="font-semibold text-white">{sheet.number} {sheet.name}</span>
        {focusView ? <><span className="text-sky-200/50">/</span><span className="text-white">{focusView.name}</span></> : null}
        <kbd className="rounded border border-sky-300/40 px-1.5 text-xs text-sky-200/80">Esc</kbd>
        <span className="flex-1" />
        {group && group !== 'schedules' && !focusView ? <ScaleChips group={group} extent={extent} /> : null}
        {!focusView ? (
          <>
            <button type="button" className={issue} aria-pressed={commenting} title={t('review.tool.hint')} onClick={() => setPlacing(!commenting)}>{t('review.tool')}</button>
            <button type="button" className={issue} aria-pressed={papering} onClick={() => { setPapering((x) => !x); setTitling(false); setRevising(false); }}>{t('wall.paper.button')}</button>
            <button type="button" className={issue} aria-pressed={titling} onClick={() => { setTitling((x) => !x); setPapering(false); setRevising(false); }}>{t('wall.tb.title')}</button>
            <button type="button" className={issue} aria-pressed={revising} onClick={() => { setRevising((x) => !x); setTitling(false); setPapering(false); }}>{t('revision.title')}</button>
            <button type="button" className={issue} {...keyProps(t, t('wall.fit'), 'wall.fit')} onClick={fit}>{t('wall.fit')}</button>
            <button type="button" className={issue} onClick={() => setPreviewing(true)}>{t('printPreview.open')}</button>
            <button type="button" className={issue} {...keyProps(t, t('wall.export.pdf'), 'wall.print')} onClick={print}>{t('wall.export.pdf')}</button>
            <button type="button" className={issue} onClick={() => paperRef.current && exportSheetDxf(paperRef.current, sheet)}>{t('wall.export.dxf')}</button>
          </>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-4">
        <ToolRail active={tool} onTool={startTool} adding={adding} onAdd={() => setAdding((a) => !a)} viewKind={focusView?.kind ?? view?.kind ?? null} onAll={runAll} />
        <main className="relative min-w-0 flex-1">
          {focusView ? (
            <div className="absolute inset-0 overflow-hidden rounded-md bg-white text-zinc-900">
              <DraftingView key={focusView.id} view={focusView} bare />
            </div>
          ) : (
            <div className="absolute inset-0 overflow-hidden rounded-md">
              <SheetCanvas ref={paperRef} sheet={sheet} sheetContent={sheetContent} chosenId={slot?.id ?? null} onChoose={choose} onOpen={open} onNudge={nudge} fitKey={fitKey} />
            </div>
          )}
          <div className="pointer-events-none absolute right-3 top-3 [&>*]:pointer-events-auto">
            {tool ? <InfoCard tool={tool} drawingOn={focusView?.name ?? null} />
              : focusView ? null
                : papering ? <PaperCard sheet={sheet} extent={extent} boxOf={sheetContent.boxOf} onClose={() => setPapering(false)} />
                : titling ? <TitleBlockCard sheet={sheet} onClose={() => setTitling(false)} />
                  : revising ? <RevisionsCard sheet={sheet} onClose={() => setRevising(false)} />
                  : <ViewportCard sheet={sheet} slot={slot} onOpen={open} onChoose={setChosen} drawingBounds={slot ? sheetContent.content(slot).drawing?.bounds ?? null : null} />}
          </div>
          {adding ? (
            <div className="absolute inset-x-3 bottom-3 flex justify-center">
              <AddDrawing
                onClose={() => setAdding(false)}
                onSection={() => startTool('sectionline')}
                onDetail={() => startTool('detail')}
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
      {previewing && paperRef.current ? <PrintPreview sheet={sheet} paper={paperRef.current} sheetContent={sheetContent} onClose={() => setPreviewing(false)} /> : null}
      {!focusView && group === 'sections' ? (
        <div className="flex shrink-0 justify-center px-6 pb-3">
          <SectionTray sheet={sheet} slotId={slot?.id ?? null} proposals={proposals} />
        </div>
      ) : null}
      {!focusView && !tool ? (
        <footer className="flex shrink-0 items-baseline gap-3 border-t border-zinc-200 bg-white px-6 py-3 text-sm text-zinc-700">
          <strong className="text-zinc-900">{t('wall.sheetHint.title')}</strong>
          <span>{t('wall.sheetHint.body')}</span>
        </footer>
      ) : null}
    </div>
  );
}
