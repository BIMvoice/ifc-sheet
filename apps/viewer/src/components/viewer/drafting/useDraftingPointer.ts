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
import { baseDraftSettings, clickDrawing, constrainFrom, constrainPoint, pickEntity, resolveLevelRef, runningCommand, setOrthoHeld, useDraftingSession, windowSelect } from '@/drafting/session';
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
import { updateProjectView, useProjectStore } from '@/project/project-store';

const SNAP_PX = 10;
const PICK_PX = 6;
const DRAG_PX = 4;
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

export interface DraftingPointerState {
  cursor: Pt | null;
  snap: SnapHit | null;
  hoverId: string | null;
  window: { a: Pt; b: Pt } | null;
  /** A grip being dragged, and where to. */
  gripDrag: { grip: Grip; at: Pt } | null;
}

/** A dimension line dragged near another dimension line goes onto it, unless the toggle is off (`dimAlign`). */
function alignedDragPoint(grip: Grip, p: Pt): Pt {
  return baseDraftSettings().dimAlign ? alignDraggedGrip(useProjectStore.getState().drafts, grip.id, grip.key, p).at : p;
}

export function useDraftingPointer({ containerRef, transform, setTransform, axis, entityShapes, references, grips = [] }: Params) {
  const snapOn = useDraftingSession((s) => s.snap);
  const [state, setState] = useState<DraftingPointerState>({ cursor: null, snap: null, hoverId: null, window: null, gripDrag: null });
  const drag = useRef<{ kind: 'pan' | 'window' | 'grip'; startScreen: Pt; startDrawing: Pt; startTransform: ViewTransform; grip?: Grip } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const resolve = useCallback((raw: Pt): { point: Pt; snap: SnapHit | null } => {
    const command = runningCommand();
    const wantsPoint = command?.input() === 'point';
    if (!wantsPoint || !snapOn) return { point: wantsPoint ? constrainPoint(raw) : raw, snap: null };
    const tolerance = SNAP_PX / transform.scale;
    const from = command?.basePoint() ?? null;
    let hit = findSnap(raw, entityShapes, null, { tolerance, modes: ALL_MODES, from });
    if (references) {
      const min = { x: raw.x - tolerance, y: raw.y - tolerance };
      const max = { x: raw.x + tolerance, y: raw.y + tolerance };
      hit = better(hit, findSnap(raw, referencesIn(references, min, max), null, { tolerance, modes: ALL_MODES, from }), raw);
    }
    return hit ? { point: hit.point, snap: hit } : { point: constrainPoint(raw), snap: null };
  }, [snapOn, transform.scale, entityShapes, references]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    setOrthoHeld(e.ctrlKey);
    const s = local(e);
    const d = drag.current;
    if (d?.kind === 'pan') {
      setTransform({ ...d.startTransform, x: d.startTransform.x + s.x - d.startScreen.x, y: d.startTransform.y + s.y - d.startScreen.y });
      return;
    }
    const raw = screenToDrawing(s, transform, axis);
    if (d?.kind === 'grip' && d.grip) {
      // A dragged grip snaps like a point does, and keeps to horizontal / vertical from where it started under the ortho lock
      // (a detail's crop corner moves freely on both axes, and a section's depth is measured along the section's normal,
      // which a horizontal / vertical hold would only project onto, so neither is held).
      const hit = snapOn ? findSnap(raw, entityShapes, null, { tolerance: SNAP_PX / transform.scale, modes: ALL_MODES, from: null }) : null;
      const free = hit?.point ?? raw;
      const at = d.grip.detail || d.grip.section ? free : alignedDragPoint(d.grip, constrainFrom(d.grip.at, free));
      setState({ cursor: at, snap: hit, hoverId: null, window: null, gripDrag: { grip: d.grip, at } });
      return;
    }
    const { point, snap } = resolve(raw);
    const command = runningCommand();
    const hoverId = !command || command.input() === 'pick' ? pickEntity(raw, PICK_PX / transform.scale)?.id ?? null : null;
    const window = d?.kind === 'window' && Math.hypot(s.x - d.startScreen.x, s.y - d.startScreen.y) > DRAG_PX ? { a: d.startDrawing, b: raw } : null;
    setState({ cursor: point, snap, hoverId, window, gripDrag: null });
  }, [transform, axis, resolve, setTransform, snapOn, entityShapes]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setOrthoHeld(e.ctrlKey);
    const s = local(e);
    capturePointer(e.currentTarget as HTMLElement, e.pointerId);
    if (e.button === 1) {
      e.preventDefault();
      drag.current = { kind: 'pan', startScreen: s, startDrawing: screenToDrawing(s, transform, axis), startTransform: transform };
      return;
    }
    if (e.button !== 0) return;
    const raw = screenToDrawing(s, transform, axis);
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
    drag.current = { kind: 'window', startScreen: s, startDrawing: raw, startTransform: transform };
  }, [transform, axis, resolve, grips]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'grip' && d.grip) {
      const target = state.gripDrag;
      if (d.grip.section) {
        // The depth handle sets the section view's depth: one undo step per drag.
        const depth = target ? depthFromPoint(d.grip.section, target.at) : null;
        if (depth !== null) runAsOneUndoStep(() => updateProjectView(d.grip!.section!.viewId, { viewDepth: depth }));
        setState((prev) => ({ ...prev, gripDrag: null }));
        return;
      }
      if (d.grip.detail) {
        // A crop grip changes the detail's area; its mark follows. One undo step per drag.
        const rect = target ? moveDetailGrip(d.grip.detail.rect, d.grip.key, target.at) : null;
        if (rect) setDetailRect(d.grip.detail.viewId, rect);
        setState((prev) => ({ ...prev, gripDrag: null }));
        return;
      }
      const entity = useProjectStore.getState().drafts.find((x) => x.id === d.grip?.id);
      if (target && entity) editDrafts({ update: new Map([[entity.id, moveGrip(entity.shape, d.grip.key, target.at, resolveLevelRef)]]) });
      setState((prev) => ({ ...prev, gripDrag: null }));
      return;
    }
    const s = local(e);
    const raw = screenToDrawing(s, transform, axis);
    if (Math.hypot(s.x - d.startScreen.x, s.y - d.startScreen.y) > DRAG_PX) {
      // Dragging leftward on screen is a crossing selection.
      windowSelect(d.startDrawing, raw, s.x < d.startScreen.x, e.shiftKey);
    } else {
      clickDrawing(raw, PICK_PX / transform.scale, e.shiftKey);
    }
    setState((prev) => ({ ...prev, window: null }));
  }, [transform, axis, state.gripDrag]);

  const onPointerLeave = useCallback(() => setState((prev) => ({ ...prev, cursor: null, snap: null, hoverId: null })), []);

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
