/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pointer handling for a drafting view: snapping, clicks into the running
 * command, window / crossing selection, middle-button pan and wheel zoom
 * about the cursor. (Space is the CAD confirm key, so it does not pan.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { screenToDrawing, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { baseDraftSettings, clickDrawing, constrainFrom, constrainPoint, pickEntity, resolveLevelRef, runningCommand, selectIn, setDraftSelection, setOrthoHeld, useDraftingSession, visibleEntities, windowSelect } from '@/drafting/session';
import { commitSelectionDrag, dragSelectionTo, dragSnapTargets, selectionDragPreview, startSelectionDrag, type DragAim, type SelectionDrag } from '@/drafting/drag-selection';
import { thinPath } from '@/drafting/region-select';
import { findSnap } from '@/drafting/snaps';
import { capturePointer } from '@/lib/pointer-capture';
import { referencesIn, type ReferenceSet } from '@/drafting/references';
import type { DraftShape, Pt, SnapHit, SnapMode } from '@/drafting/types';
import { gripAt, moveGrip, type Grip } from '@/drafting/grips';
import { alignDraggedGrip } from '@/drafting/dimension-align';
import { editDrafts, runAsOneUndoStep } from '@/drafting/draft-store';
import { depthFromPoint } from '@/drafting/section-depth';
import { moveDetailGrip } from '@/drafting/detail-mark';
import { setDetailRect } from '@/drafting/commands/detail';
import { DWELL_MS, EMPTY_TRACK, hover, nearLines, tick, trackSnap, type TrackLine, type TrackState } from '@/drafting/tracking';
import { useTrackingPref } from '@/drafting/tracking-pref';
import { updateProjectView, useProjectStore } from '@/project/project-store';

const SNAP_PX = 10;
const PICK_PX = 6;
const wantsPointNow = (command: ReturnType<typeof runningCommand>): boolean => command?.input() === 'point';
const DRAG_PX = 4;
/** A lasso keeps a point each time the pointer has moved this far on screen. */
const LASSO_STEP_PX = 3;
const GRIP_PX = 7;
const SNAP_ORDER: readonly SnapMode[] = ['endpoint', 'intersection', 'midpoint', 'center', 'quadrant', 'perpendicular', 'nearest'];
const ALL_MODES: ReadonlySet<SnapMode> = new Set(SNAP_ORDER);

function better(a: SnapHit | null, b: SnapHit | null, cursor: Pt): SnapHit | null {
  if (!a) return b;
  if (!b) return a;
  const ra = SNAP_ORDER.indexOf(a.mode);
  const rb = SNAP_ORDER.indexOf(b.mode);
  if (ra !== rb) return ra < rb ? a : b;
  const da = Math.hypot(a.point.x - cursor.x, a.point.y - cursor.y);
  const db = Math.hypot(b.point.x - cursor.x, b.point.y - cursor.y);
  return da <= db ? a : b;
}

interface Params {
  containerRef: React.RefObject<HTMLDivElement | null>;
  transform: ViewTransform;
  setTransform: React.Dispatch<React.SetStateAction<ViewTransform>>;
  axis: SectionAxisName;
  entityShapes: readonly DraftShape[];
  references: ReferenceSet | null;
  /** The selected entities' grips. */
  grips?: readonly Grip[];
}

/** What the canvas shows of tracking (#667): the points acquired, and the lines near the cursor. */
export interface TrackingView {
  acquired: readonly Pt[];
  lines: readonly TrackLine[];
}

const NO_TRACKING: TrackingView = { acquired: [], lines: [] };
/** A line this close to the cursor (screen px) is drawn, so the one to line up with shows before it catches. */
const TRACK_SHOW_PX = 40;
const DWELL_AFTER_MS = DWELL_MS + 20;

export interface DraftingPointerState {
  tracking: TrackingView;
  cursor: Pt | null;
  snap: SnapHit | null;
  hoverId: string | null;
  window: { a: Pt; b: Pt } | null;
  /** The freehand loop being drawn with Alt held (#666), in drawing units. */
  lasso: readonly Pt[] | null;
  /** A grip being dragged, and where to. */
  gripDrag: { grip: Grip; at: Pt } | null;
  /** The grip under the cursor while nothing runs and none is held (#454): the canvas shows it can be picked up. */
  gripHover: Grip | null;
  /** The selection being dragged (#168), and its outlines where it would land; null while the press is still a click. */
  selectionDrag: { drag: SelectionDrag; preview: DraftShape[] } | null;
}

/** The canvas cursor over a grip: an open hand to pick it up by click or drag, a closed one while it is carried; null elsewhere. */
export function gripCursor(state: Pick<DraftingPointerState, 'gripDrag' | 'gripHover'>): 'grab' | 'grabbing' | null {
  return state.gripDrag ? 'grabbing' : state.gripHover ? 'grab' : null;
}

/** A dimension line dragged near another dimension line goes onto it, unless the toggle is off (`dimAlign`). */
function alignedDragPoint(grip: Grip, p: Pt): Pt {
  return baseDraftSettings().dimAlign ? alignDraggedGrip(useProjectStore.getState().drafts, grip.id, grip.key, p).at : p;
}

/** Where the ortho lock measures a dragged grip from: the fixed end of a line (a section mark's end must stay straight, #650), else the grip's own start. */
function orthoPivot(grip: Grip): Pt {
  const shape = useProjectStore.getState().drafts.find((d) => d.id === grip.id)?.shape;
  if (shape?.type === 'line' || shape?.type === 'axis') {
    if (grip.key === 'a') return shape.b;
    if (grip.key === 'b') return shape.a;
  }
  return grip.at;
}

export function useDraftingPointer({ containerRef, transform, setTransform, axis, entityShapes, references, grips = [] }: Params) {
  const snapOn = useDraftingSession((s) => s.snap);
  const trackOn = useTrackingPref((s) => s.on);
  const track = useRef<TrackState>(EMPTY_TRACK);
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<DraftingPointerState>({ tracking: NO_TRACKING, cursor: null, snap: null, hoverId: null, window: null, lasso: null, gripDrag: null, gripHover: null, selectionDrag: null });
  /** A grip picked up by a click and carried until the next click drops it (#454). */
  const carry = useRef<Grip | null>(null);
  const drag = useRef<{ kind: 'pan' | 'window' | 'lasso' | 'grip' | 'selection'; path?: readonly Pt[]; startScreen: Pt; startDrawing: Pt; startTransform: ViewTransform; grip?: Grip; selection?: SelectionDrag; moved?: boolean } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const resolve = useCallback((raw: Pt): { point: Pt; snap: SnapHit | null } => {
    const command = runningCommand();
    const wantsPoint = command?.input() === 'point';
    if (!wantsPoint || !snapOn) {
      track.current = EMPTY_TRACK;
      return { point: wantsPoint ? constrainPoint(raw) : raw, snap: null };
    }
    const tolerance = SNAP_PX / transform.scale;
    const from = command?.basePoint() ?? null;
    let hit = findSnap(raw, entityShapes, null, { tolerance, modes: ALL_MODES, from });
    if (references) {
      const min = { x: raw.x - tolerance, y: raw.y - tolerance };
      const max = { x: raw.x + tolerance, y: raw.y + tolerance };
      hit = better(hit, findSnap(raw, referencesIn(references, min, max), null, { tolerance, modes: ALL_MODES, from }), raw);
    }
    // An object snap wins; 'nearest' (anywhere on a curve) gives way to a tracking line, which is the more deliberate aim (#667).
    if (hit && hit.mode !== 'nearest') return { point: hit.point, snap: hit };
    if (!trackOn) track.current = EMPTY_TRACK;
    const { ortho, orthoHeld } = useDraftingSession.getState();
    const tracked = trackOn ? trackSnap(raw, track.current.acquired, tolerance, { base: from, ortho: ortho || orthoHeld }) : null;
    if (tracked) return { point: tracked.point, snap: null };
    return hit ? { point: hit.point, snap: hit } : { point: constrainPoint(raw), snap: null };
  }, [snapOn, trackOn, transform.scale, entityShapes, references]);

  /** How a dragged selection's point lands (#168): on the drafted lines and the drawing's own, as a tool's point does. */
  const aimAt = useCallback((raw: Pt, shapes: readonly DraftShape[]): DragAim => {
    const tolerance = SNAP_PX / transform.scale;
    const near = references ? referencesIn(references, { x: raw.x - tolerance, y: raw.y - tolerance }, { x: raw.x + tolerance, y: raw.y + tolerance }) : [];
    const { ortho, orthoHeld } = useDraftingSession.getState();
    return { targets: snapOn ? [...shapes, ...near] : null, tolerance, ortho: ortho || orthoHeld };
  }, [snapOn, transform.scale, references]);

  /** Rests on an endpoint or corner acquire it after a beat; the lines near the cursor are what the canvas draws. */
  const trackingView = useCallback((point: Pt, snap: SnapHit | null, wantsPoint: boolean): TrackingView => {
    if (!trackOn || !wantsPoint || !snapOn) return NO_TRACKING;
    const before = track.current.pending;
    track.current = hover(track.current, snap?.mode === 'endpoint' ? snap.point : null, performance.now());
    const pending = track.current.pending;
    if (pending !== before) {
      if (dwell.current) clearTimeout(dwell.current);
      dwell.current = pending && Number.isFinite(pending.since) ? setTimeout(() => {
        dwell.current = null;
        const next = tick(track.current, performance.now());
        if (next === track.current) return;
        track.current = next;
        setState((prev) => ({ ...prev, tracking: { acquired: next.acquired, lines: nearLines(next.acquired, prev.cursor ?? point, TRACK_SHOW_PX / transform.scale) } }));
      }, DWELL_AFTER_MS) : null;
    }
    return { acquired: track.current.acquired, lines: nearLines(track.current.acquired, point, TRACK_SHOW_PX / transform.scale) };
  }, [trackOn, snapOn, transform.scale]);

  /** Applies a dragged or carried grip: the section depth, a detail's crop, or the entity's own shape. One undo step. */
  const commitGrip = useCallback((grip: Grip, target: { at: Pt } | null) => {
    setState((prev) => ({ ...prev, gripDrag: null }));
    if (grip.section) {
      // The depth handle sets the section view's depth: one undo step per drag.
      const depth = target ? depthFromPoint(grip.section, target.at) : null;
      if (depth !== null) runAsOneUndoStep(() => updateProjectView(grip.section!.viewId, { viewDepth: depth }));
      return;
    }
    if (grip.detail) {
      // A crop grip changes the detail's area; its mark follows. One undo step per drag.
      const rect = target ? moveDetailGrip(grip.detail.rect, grip.key, target.at) : null;
      if (rect) setDetailRect(grip.detail.viewId, rect);
      return;
    }
    const entity = useProjectStore.getState().drafts.find((x) => x.id === grip.id);
    if (target && entity) editDrafts({ update: new Map([[entity.id, moveGrip(entity.shape, grip.key, target.at, resolveLevelRef)]]) });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    setOrthoHeld(e.ctrlKey || e.shiftKey);
    const s = local(e);
    const d = drag.current;
    if (d?.kind === 'pan') {
      setTransform({ ...d.startTransform, x: d.startTransform.x + s.x - d.startScreen.x, y: d.startTransform.y + s.y - d.startScreen.y });
      return;
    }
    const raw = screenToDrawing(s, transform, axis);
    if (d?.kind === 'selection' && d.selection) {
      // Past a few pixels the press is a drag: the selection follows the cursor, Alt makes it a copy (#168).
      if (!d.moved && Math.hypot(s.x - d.startScreen.x, s.y - d.startScreen.y) <= DRAG_PX) return;
      d.moved = true;
      const next = dragSelectionTo(d.selection, raw, aimAt(raw, dragSnapTargets(entityShapes, { ...d.selection, copy: e.altKey })), e.altKey);
      d.selection = next;
      setState({ tracking: NO_TRACKING, cursor: next.to, snap: next.snap, hoverId: null, window: null, lasso: null, gripDrag: null, gripHover: null, selectionDrag: { drag: next, preview: selectionDragPreview(next) } });
      return;
    }
    const held = d?.kind === 'grip' ? d.grip : carry.current;
    if (held) {
      // A dragged grip snaps like a point does, and keeps to horizontal / vertical under the ortho lock (from the opposite end of a line, else from where it started)
      // (a detail's crop corner moves freely on both axes, and a section's depth is measured along the section's normal,
      // which a horizontal / vertical hold would only project onto, so neither is held).
      const hit = snapOn ? findSnap(raw, entityShapes, null, { tolerance: SNAP_PX / transform.scale, modes: ALL_MODES, from: null }) : null;
      const free = hit?.point ?? raw;
      const at = held.detail || held.section ? free : alignedDragPoint(held, constrainFrom(orthoPivot(held), free));
      setState({ tracking: NO_TRACKING, cursor: at, snap: hit, hoverId: null, window: null, lasso: null, gripDrag: { grip: held, at }, gripHover: null, selectionDrag: null });
      return;
    }
    const { point, snap } = resolve(raw);
    const command = runningCommand();
    const hoverId = !command || command.input() === 'pick' ? pickEntity(raw, PICK_PX / transform.scale)?.id ?? null : null;
    const window = d?.kind === 'window' && Math.hypot(s.x - d.startScreen.x, s.y - d.startScreen.y) > DRAG_PX ? { a: d.startDrawing, b: raw } : null;
    const lasso = d?.kind === 'lasso' ? (d.path = thinPath(d.path ?? [], raw, LASSO_STEP_PX / transform.scale)) : null;
    const gripHover = !command && !d ? gripAt(grips, raw, GRIP_PX / transform.scale) : null;
    const tracking = trackingView(point, snap, wantsPointNow(command));
    setState({ tracking, cursor: point, snap, hoverId, window, lasso, gripDrag: null, gripHover, selectionDrag: null });
  }, [transform, axis, resolve, setTransform, snapOn, entityShapes, grips, trackingView, aimAt]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setOrthoHeld(e.ctrlKey || e.shiftKey);
    const s = local(e);
    capturePointer(e.currentTarget as HTMLElement, e.pointerId);
    if (e.button === 1) {
      e.preventDefault();
      drag.current = { kind: 'pan', startScreen: s, startDrawing: screenToDrawing(s, transform, axis), startTransform: transform };
      return;
    }
    if (e.button !== 0) return;
    const raw = screenToDrawing(s, transform, axis);
    if (carry.current) {
      // The second click of a click-click move drops the carried grip where it now is.
      const grip = carry.current;
      carry.current = null;
      commitGrip(grip, state.gripDrag);
      return;
    }
    const command = runningCommand();
    if (command && command.input() === 'point') {
      clickDrawing(resolve(raw).point, PICK_PX / transform.scale, e.shiftKey);
      return;
    }
    if (command) {
      clickDrawing(raw, PICK_PX / transform.scale, e.shiftKey);
      return;
    }
    const grip = gripAt(grips, raw, GRIP_PX / transform.scale);
    if (grip) {
      drag.current = { kind: 'grip', startScreen: s, startDrawing: raw, startTransform: transform, grip };
      return;
    }
    // A press on a drafted element already selected picks the selection up (#168); the model's own lines are never drafts.
    const { viewId, selection } = useDraftingSession.getState();
    const hit = viewId && selection.size > 0 ? pickEntity(raw, PICK_PX / transform.scale) : null;
    const picked = viewId ? startSelectionDrag(viewId, selection, visibleEntities(viewId), hit, raw, aimAt(raw, entityShapes), e.altKey) : null;
    if (picked) {
      drag.current = { kind: 'selection', startScreen: s, startDrawing: raw, startTransform: transform, selection: picked };
      return;
    }
    // Alt + drag draws a loop (lasso); a plain drag draws the box (window or crossing).
    drag.current = { kind: e.altKey ? 'lasso' : 'window', path: [raw], startScreen: s, startDrawing: raw, startTransform: transform };
  }, [transform, axis, resolve, grips, state.gripDrag, commitGrip, aimAt, entityShapes]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'grip' && d.grip) {
      const at = local(e);
      if (Math.hypot(at.x - d.startScreen.x, at.y - d.startScreen.y) <= DRAG_PX) {
        // A click, not a drag: the grip is picked up and follows the cursor until the next click drops it.
        carry.current = d.grip;
        setState((prev) => ({ ...prev, gripDrag: { grip: d.grip!, at: d.grip!.at }, gripHover: null }));
        return;
      }
      commitGrip(d.grip, state.gripDrag);
      return;
    }
    if (d.kind === 'selection' && d.selection && d.moved) {
      // Let go: one undo step, as MOVE or COPY; a copy leaves the copies selected. (Not moved: a click, as before.)
      const next = commitSelectionDrag(d.selection);
      if (next) setDraftSelection(next);
      setState((prev) => ({ ...prev, selectionDrag: null }));
      return;
    }
    const s = local(e);
    const raw = screenToDrawing(s, transform, axis);
    // A loop that comes back to where it began is still a drag: it counts by how far it went, not where it ended.
    const wentFar = d.kind === 'lasso' ? (d.path ?? []).some((p) => Math.hypot(p.x - d.startDrawing.x, p.y - d.startDrawing.y) * transform.scale > DRAG_PX) : Math.hypot(s.x - d.startScreen.x, s.y - d.startScreen.y) > DRAG_PX;
    if (wentFar) {
      // Dragging leftward on screen is a crossing selection; a loop selects what it encloses.
      if (d.kind === 'lasso') selectIn({ kind: 'loop', pts: d.path ?? [] }, false, e.shiftKey);
      else windowSelect(d.startDrawing, raw, s.x < d.startScreen.x, e.shiftKey);
    } else {
      clickDrawing(raw, PICK_PX / transform.scale, e.shiftKey);
    }
    setState((prev) => ({ ...prev, window: null, lasso: null }));
  }, [transform, axis, state.gripDrag, commitGrip]);

  useEffect(() => () => { if (dwell.current) clearTimeout(dwell.current); }, []);

  // Esc while a selection is dragged puts it back where it was (nothing has changed yet) and keeps it selected (#168).
  // Registered once, at mount, so it comes before the drafting keys' Esc, which would clear the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || drag.current?.kind !== 'selection') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      drag.current = null;
      setState((prev) => ({ ...prev, selectionDrag: null }));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onPointerLeave = useCallback(() => setState((prev) => ({ ...prev, cursor: null, snap: null, hoverId: null, gripHover: null })), []);

  // Wheel zoom about the cursor (native: React's wheel listener is passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform((t) => {
        const scale = Math.min(Math.max(t.scale * factor, 0.01), 100000);
        const k = scale / t.scale;
        return { scale, x: sx - (sx - t.x) * k, y: sy - (sy - t.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef, setTransform]);

  return { state, handlers: { onPointerMove, onPointerDown, onPointerUp, onPointerLeave } };
}
