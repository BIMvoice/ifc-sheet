/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A stepped-into sheet to work on: the wheel zooms about the cursor, a drag
 * on empty paper (or with the middle button) pans; a click chooses a drawing
 * (viewport) and a drag moves it; a double-click opens it to draw in; Delete
 * takes it off the sheet; its grips resize the crop (`ViewportHandles`). Alt and the wheel over a drawing move its cut (a
 * plan) or its depth (a section, an elevation). Plain drawing on the paper
 * (lines, text, hatched zones) goes through the same drafting session as a
 * view, in paper millimetres (`useSheetDrafting`).
 */

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePat } from '@/drafting/hatch/pattern';
import { pressEscape, runningCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';
import type { Pt } from '@/drafting/types';
import { capturePointer } from '@/lib/pointer-capture';
import { useProjectStore } from '@/project/project-store';
import { paperOf, removeViewport, updateViewport } from '@/project/sheets';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { CommandLine } from '../drafting/CommandLine';
import { useDraftingKeys } from '../drafting/useDraftingKeys';
import { useSheetDrafting } from '../sheets/useSheetDrafting';
import type { SheetContent } from '../sheets/useSheetContent';
import { isResizable } from '@/project/viewport-resize';
import { ViewportHandles } from './ViewportHandles';
import { CommentLayer } from './CommentLayer';
import { WallSheet } from './WallSheet';
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
  useDraftingKeys({ inputRef, setText, submit: () => submitCommandLine('', last.current) });
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

  const drag = useRef<{ kind: 'pan' | 'move'; sx: number; sy: number; start: Pan; vp?: SheetViewport } | null>(null);
  // The chosen drawing shows grips to resize its crop, unless a tool is drawing (its clicks are the tool's) or the drawing is not generated yet:
  // the crop's centre is stored against where the drawing is on the paper, which is unknown until it exists.
  const chosenVp = (sheet.viewports ?? []).find((v) => v.id === chosenId) ?? null;
  const chosenDrawing = chosenVp ? sheetContent.content(chosenVp).drawing ?? null : null;
  // A schedule wrapped to its viewport (#186) has grips too: dragging one re-wraps its bands, and the box stops at one band whole.
  // The first sheet's box rules every page, so a continuation sheet has none of its own to drag.
  const chosenFit = chosenVp && (chosenVp.page ?? 0) === 0 ? sheetContent.content(chosenVp).schedule?.fit : undefined;
  const resizing = chosenVp && !drafting.drafting && ((chosenDrawing && isResizable(views.find((v) => v.id === chosenVp.viewId))) || chosenFit) ? chosenVp : null;
  const showPrompt = drafting.drafting || draftSelection.size > 0;

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
          drag.current = { kind: vp ? 'move' : 'pan', sx: e.clientX, sy: e.clientY, start: pan, vp: vp ?? undefined };
        }}
        onPointerMove={(e) => {
          last.current = toPaper(e.clientX, e.clientY);
          drafting.move(last.current);
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.sx;
          const dy = e.clientY - d.sy;
          if (d.kind === 'pan') setPan({ ...d.start, x: d.start.x + dx, y: d.start.y + dy });
          else if (d.vp && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) updateViewport(sheet.id, d.vp.id, { x: d.vp.x + dx / pan.k, y: d.vp.y + dy / pan.k });
        }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={(e) => {
          const vp = viewportAt(toPaper(e.clientX, e.clientY));
          if (vp && !runningCommand()) onOpen(vp);
        }}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          <WallSheet ref={paperRef} sheet={sheet} width={paper.w * pan.k} selectedViewportId={chosenId} sheetContent={sheetContent} pinned={false} />
        </div>
        {drafting.overlay}
        {resizing ? <ViewportHandles key={resizing.id} sheet={sheet} vp={resizing} box={sheetContent.boxOf(resizing)} drawing={chosenDrawing} pan={pan} min={chosenFit?.min} /> : null}
        <CommentLayer sheet={sheet} pan={pan} toPaper={toPaper} />
      </div>
      {showPrompt ? (
        <div className="bg-white text-zinc-900">
          <CommandLine ref={inputRef} value={text} onChange={setText} onSubmit={() => { submitCommandLine(text, last.current); setText(''); }} onEscape={() => { setText(''); pressEscape(); }} />
        </div>
      ) : null}
    </div>
  );
});
