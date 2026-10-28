/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A stepped-into sheet to work on: the wheel zooms about the cursor, a drag
 * on empty paper (or with the middle button) pans; a click chooses a drawing
 * (viewport) and a drag moves it, snapping to the frame, the title block and the other drawings (guides show while it does, one
 * drag is one undo step); the arrow keys nudge it 1 mm (10 with Shift); a double-click opens it to draw in; Delete
 * takes it off the sheet; its grips resize the crop (`ViewportHandles`). Alt and the wheel over a drawing move its cut (a
 * plan) or its depth (a section, an elevation). Plain drawing on the paper
 * (lines, text, hatched zones) goes through the same drafting session as a
 * view, in paper millimetres (`useSheetDrafting`).
 */

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePat } from '@/drafting/hatch/pattern';
import { pressEscape, runningCommand, useDraftingSession } from '@/drafting/session';
import type { Pt } from '@/drafting/types';
import { useAutocadMode } from '@/lib/commands/autocad-mode';
import { capturePointer } from '@/lib/pointer-capture';
import { useProjectStore } from '@/project/project-store';
import { paperOf, removeViewport, updateViewport } from '@/project/sheets';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { NUDGE_MM, nudgeViewport, snapMove, snapTargets, snapTolerance, type SnapLine } from '@/project/viewport-snap';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { CommandLine } from '../drafting/CommandLine';
import { useDraftingKeys } from '../drafting/useDraftingKeys';
import { submitTypedLine } from '../drafting/typed-line';
import { useSheetDrafting } from '../sheets/useSheetDrafting';
import type { SheetContent } from '../sheets/useSheetContent';
import { isResizable } from '@/project/viewport-resize';
import { cellAt, pickCell } from '@/joinery/list-cell-pick';
import { ViewportHandles } from './ViewportHandles';
import { SheetHints } from '@/onboarding/SheetHints';
import { dismissHint } from '@/onboarding/hints';
import { CommentLayer } from './CommentLayer';
import { WallSheet } from './WallSheet';
import { keysBelongElsewhere } from './wall-key-bus';
import { isDraftingKey } from '../drafting/drafting-key-match';
import { openKeyboardOverlay } from '@/lib/commands/dispatcher';

interface Pan { x: number; y: number; k: number }

interface SheetCanvasProps {
  sheet: ProjectSheet;
  sheetContent: SheetContent;
  chosenId: string | null;
  onChoose: (viewportId: string | null) => void;
  /** Open a drawing to draw in (double-click). */
  onOpen: (viewport: SheetViewport) => void;
  /** Alt + wheel over a drawing: steps of its cut or depth. */
  onNudge: (viewport: SheetViewport, steps: number) => void;
  /** Bumped to fit the whole sheet in view again. */
  fitKey: number;
}

const ZOOM = { min: 0.05, max: 40 } as const;
const ARROWS: Record<string, { x: number; y: number }> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

export const SheetCanvas = forwardRef<SVGSVGElement, SheetCanvasProps>(function SheetCanvas({ sheet, sheetContent, chosenId, onChoose, onOpen, onNudge, fitKey }, paperRef) {
  const host = useRef<HTMLDivElement>(null);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const extraPatterns = useMemo(() => parsePat(patternText).patterns, [patternText]);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0, k: 1 });
  const paper = paperOf(sheet);
  const views = useProjectStore((s) => s.views);

  // Fit the whole sheet on arrival, when the paper changes, and on request.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const k = Math.max(ZOOM.min, Math.min((width - 24) / paper.w, (height - 24) / paper.h));
    setPan({ k, x: (width - paper.w * k) / 2, y: (height - paper.h * k) / 2 });
  }, [paper.w, paper.h, fitKey]);

  const drafting = useSheetDrafting(sheet.id, pan, extraPatterns);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const last = useRef<Pt | null>(null);
  useDraftingKeys({ inputRef, setText, submit: () => submitTypedLine('', last.current) });
  const draftSelection = useDraftingSession((s) => s.selection);

  const toPaper = (clientX: number, clientY: number): Pt => {
    const rect = host.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0) - pan.x) / pan.k, y: (clientY - (rect?.top ?? 0) - pan.y) / pan.k };
  };
  const viewportAt = (p: Pt): SheetViewport | null => [...(sheet.viewports ?? [])].reverse().find((vp) => {
    const box = sheetContent.boxOf(vp);
    return Math.abs(p.x - vp.x) <= box.width / 2 && Math.abs(p.y - vp.y) <= box.height / 2;
  }) ?? null;

  // The wheel: zoom about the cursor; with Alt over a drawing, its cut or depth.
  const wheelState = useRef({ pan, viewportAt, onNudge, onChoose });
  wheelState.current = { pan, viewportAt, onNudge, onChoose };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { pan: p, viewportAt: at, onNudge: nudge, onChoose: choose } = wheelState.current;
      if (e.altKey) {
        const vp = at({ x: (sx - p.x) / p.k, y: (sy - p.y) / p.k });
        if (vp) {
          choose(vp.id);
          nudge(vp, e.deltaY < 0 ? 1 : -1);
        }
        return;
      }
      const f = Math.exp(-e.deltaY * 0.0015);
      setPan((q) => {
        const k = Math.min(Math.max(q.k * f, ZOOM.min), ZOOM.max);
        return { k, x: sx - (sx - q.x) * (k / q.k), y: sy - (sy - q.y) * (k / q.k) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Delete takes the chosen drawing off the sheet (a drafted selection is the drafting keys' own).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Erase's keys as bound now (`drafting.erase`), not a key of this sheet's own.
      if (!chosenId || !isDraftingKey('drafting.erase', e) || openKeyboardOverlay()) return;
      if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (runningCommand() || useDraftingSession.getState().selection.size > 0) return;
      removeViewport(sheet.id, chosenId);
      onChoose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosenId, sheet.id, onChoose]);

  // The arrow keys nudge the chosen drawing by a whole millimetre (10 with Shift), one undo step a press. They belong to
  // anything else that wants them: a text field (the command line included, as `keysBelongElsewhere` says for AutoCAD mode), a
  // panel with its own keys (a focused grip resizes), a running tool or a drafted selection, an open overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const arrow = ARROWS[e.key];
      const vp = chosenId ? (sheet.viewports ?? []).find((v) => v.id === chosenId) : undefined;
      if (!arrow || !vp || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (keysBelongElsewhere(e.target) || openKeyboardOverlay()) return;
      if (runningCommand() || useDraftingSession.getState().selection.size > 0) return;
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_MM.big : NUDGE_MM.step;
      nudgeViewport(sheet.id, vp, arrow.x * step, arrow.y * step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosenId, sheet]);

  const drag = useRef<{ kind: 'pan' | 'move'; sx: number; sy: number; start: Pan; vp?: SheetViewport; sheet?: ProjectSheet; targets?: SnapLine[]; last?: { x: number; y: number } } | null>(null);
  const [guides, setGuides] = useState<SnapLine[]>([]);
  const endDrag = (): void => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    // The live drag wrote the sheet step by step; the history gets the one change, from the start to the end.
    if (d?.kind === 'move' && d.vp && d.sheet && d.last) {
      const { vp: from, last } = d;
      useProjectStore.setState((s) => ({ sheets: s.sheets.map((o) => (o.id === d.sheet?.id ? d.sheet : o)) }));
      runAsOneUndoStep(() => updateViewport(sheet.id, from.id, last));
    }
  };
  // The chosen drawing shows grips to resize its crop, unless a tool is drawing (its clicks are the tool's) or the drawing is not generated yet:
  // the crop's centre is stored against where the drawing is on the paper, which is unknown until it exists.
  const chosenVp = (sheet.viewports ?? []).find((v) => v.id === chosenId) ?? null;
  const chosenDrawing = chosenVp ? sheetContent.content(chosenVp).drawing ?? null : null;
  // A schedule wrapped to its viewport (#186) has grips too: dragging one re-wraps its bands, and the box stops at one band whole.
  // The first sheet's box rules every page, so a continuation sheet has none of its own to drag.
  const chosenFit = chosenVp && (chosenVp.page ?? 0) === 0 ? sheetContent.content(chosenVp).schedule?.fit : undefined;
  const resizing = chosenVp && !drafting.drafting && ((chosenDrawing && isResizable(views.find((v) => v.id === chosenVp.viewId))) || chosenFit) ? chosenVp : null;
  // AutoCAD mode (#168) keeps the command line showing, for typed commands while nothing runs.
  const autocad = useAutocadMode((s) => s.on);
  const showPrompt = drafting.drafting || draftSelection.size > 0 || autocad;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={host}
        data-sheet-canvas
        tabIndex={-1}
        className={`relative min-h-0 flex-1 overflow-hidden touch-none outline-none ${drafting.drafting ? 'cursor-none' : ''}`}
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          const p = toPaper(e.clientX, e.clientY);
          if (e.button === 0 && drafting.down(p, e.shiftKey)) return;
          const vp = e.button === 0 ? viewportAt(p) : null;
          if (vp) onChoose(vp.id);
          // A cell of a list schedule is picked by a click on it (#446); the card then offers its value to override. A drag still moves the schedule.
          const cell = vp && e.button === 0 ? cellAt(sheetContent.content(vp).schedule, p) : null;
          pickCell(vp && cell ? { scheduleId: vp.viewId, guid: cell.guid, column: cell.column } : null);
          const others = vp ? (sheet.viewports ?? []).filter((o) => o.id !== vp.id).map((o) => ({ x: o.x, y: o.y, ...sheetContent.boxOf(o) })) : [];
          drag.current = { kind: vp ? 'move' : 'pan', sx: e.clientX, sy: e.clientY, start: pan, vp: vp ?? undefined, sheet, targets: vp ? snapTargets(sheet, others) : undefined };
        }}
        onPointerMove={(e) => {
          last.current = toPaper(e.clientX, e.clientY);
          drafting.move(last.current);
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.sx;
          const dy = e.clientY - d.sy;
          if (d.kind === 'pan') setPan({ ...d.start, x: d.start.x + dx, y: d.start.y + dy });
          else if (d.vp && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
            const snapped = snapMove({ ...sheetContent.boxOf(d.vp), x: d.vp.x + dx / pan.k, y: d.vp.y + dy / pan.k }, d.targets ?? [], snapTolerance(pan.k));
            d.last = { x: snapped.x, y: snapped.y };
            setGuides(snapped.guides);
            updateViewport(sheet.id, d.vp.id, d.last);
          }
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          const vp = viewportAt(toPaper(e.clientX, e.clientY));
          if (vp && !runningCommand()) {
            dismissHint('openView');
            onOpen(vp);
          }
        }}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          <WallSheet ref={paperRef} sheet={sheet} width={paper.w * pan.k} selectedViewportId={chosenId} sheetContent={sheetContent} pinned={false} />
        </div>
        {guides.length > 0 ? (
          <svg data-snap-guides className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }} width={paper.w * pan.k} height={paper.h * pan.k} viewBox={`0 0 ${paper.w} ${paper.h}`} aria-hidden="true">
            {guides.map((g) => (
              <line key={`${g.axis}${g.at}`} data-snap-guide={g.axis} x1={g.axis === 'x' ? g.at : g.from} x2={g.axis === 'x' ? g.at : g.to} y1={g.axis === 'x' ? g.from : g.at} y2={g.axis === 'x' ? g.to : g.at} stroke="#e11d8f" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        ) : null}
        {drafting.overlay}
        <SheetHints resizing={resizing !== null} hasDrawings={(sheet.viewports ?? []).length > 0} />
        {resizing ? <ViewportHandles key={resizing.id} sheet={sheet} vp={resizing} box={sheetContent.boxOf(resizing)} drawing={chosenDrawing} pan={pan} min={chosenFit?.min} /> : null}
        <CommentLayer sheet={sheet} pan={pan} toPaper={toPaper} />
      </div>
      {showPrompt ? (
        <div className="bg-white text-zinc-900">
          <CommandLine ref={inputRef} value={text} onChange={setText} onSubmit={() => { submitTypedLine(text, last.current); setText(''); }} onEscape={() => { setText(''); pressEscape(); }} />
        </div>
      ) : null}
    </div>
  );
});
