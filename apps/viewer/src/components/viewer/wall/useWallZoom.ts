/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoom and pan on the Wall (#188). The zoom multiplies the width every sheet hangs at, so the layout itself changes and the
 * sheets stay sharp; what stays put under the cursor is found again after the layout moved by the point's place in its sheet's
 * frame. The wheel (and a trackpad pinch) zooms about the cursor, `+` `-` and Ctrl/Cmd `+` `-` step, `0` fits the whole set,
 * `1` shows a sheet at its paper size, `Z` zooms to one sheet, PageUp/PageDown (and the arrows, after a zoom to a sheet) walk
 * the sheets at that zoom. A drag on the empty Wall, or Space and a drag anywhere, pans; the scroll bars work as they did.
 */

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react';
import { openKeyboardOverlay } from '@/lib/commands/dispatcher';
import { capturePointer } from '@/lib/pointer-capture';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import { setWallLayout, scrollWallTo, useWallView } from '@/wall/wall-view';
import {
  anchorAt, clampZoom, fitFactor, neighbourSheet, SHEET_PX, stepZoom, trueSizeZoom, unionOf, useWallZoom, type SheetAnchor,
} from '@/wall/wall-zoom';
import { keysBelongElsewhere } from './wall-key-bus';
import { readWallLayout, WALL_SHEET_ATTR } from './useWallMeasure';

/** Room left round what a fit shows, px. */
const FIT_PAD = 24;
const FIT_TRIES = 10;

export interface WallZoomApi {
  zoomIn: () => void;
  zoomOut: () => void;
  /** The whole set in view. */
  fit: () => void;
  /** The reference sheet at its paper size. */
  trueSize: () => void;
  /** One sheet filling the screen, still on the Wall. */
  zoomToSheet: (id: string) => void;
}

/** The sheet the zoom keys and the level readout speak of: the one last zoomed or stepped to, else the one nearest the middle of the screen. */
export function referenceSheetId(): string | null {
  const { current } = useWallZoom.getState();
  const { layout, near } = useWallView.getState();
  if (current && layout?.sheets.some((s) => s.id === current)) return current;
  return near[0] ?? layout?.sheets[0]?.id ?? null;
}

interface Pending {
  anchor: (SheetAnchor & { cx: number; cy: number }) | null;
  fit: { ids: string[] | null; tries: number } | null;
}

export function useWallZoomControls(scroller: RefObject<HTMLDivElement | null>): WallZoomApi {
  const k = useWallZoom((s) => s.k);
  const pending = useRef<Pending>({ anchor: null, fit: null });
  const [tick, bump] = useTick();

  /** Zoom to `next`, keeping the point at client (`x`, `y`) where it is (the middle of the screen when none). */
  const zoomTo = (next: number, at?: { x: number; y: number }): void => {
    const el = scroller.current;
    const target = clampZoom(next);
    if (!el || target === useWallZoom.getState().k) return;
    if (!pending.current.anchor) {
      const origin = el.getBoundingClientRect();
      const cx = at ? at.x - origin.left : el.clientWidth / 2;
      const cy = at ? at.y - origin.top : el.clientHeight / 2;
      const anchor = anchorAt(readWallLayout(el).sheets, { x: cx + el.scrollLeft, y: cy + el.scrollTop });
      pending.current.anchor = anchor && { ...anchor, cx, cy };
    }
    useWallZoom.setState({ k: target, reading: false });
  };

  const startFit = (ids: string[] | null): void => {
    pending.current = { anchor: null, fit: { ids, tries: 0 } };
    bump();
  };

  // Once the layout has moved to the new zoom: put the anchored point back under the cursor, or take a fit one step nearer.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const p = pending.current;
    if (p.fit) {
      const layout = readWallLayout(el);
      const ids = p.fit.ids;
      const box = unionOf(layout.sheets.filter((s) => !ids || ids.includes(s.id)).map((s) => s.rect));
      const screen = { w: el.clientWidth, h: el.clientHeight };
      const ratio = box ? fitFactor(box, screen, FIT_PAD) : 1;
      const now = useWallZoom.getState().k;
      const next = clampZoom(now * ratio);
      if (box && (ratio < 0.999 || ratio > 1.05) && p.fit.tries < FIT_TRIES && next !== now) {
        p.fit.tries += 1;
        useWallZoom.setState({ k: next });
        return;
      }
      pending.current = { anchor: null, fit: null };
      if (box) {
        el.scrollLeft = Math.max(0, box.x + box.w / 2 - screen.w / 2);
        el.scrollTop = Math.max(0, box.y + box.h / 2 - screen.h / 2);
      }
    } else if (p.anchor) {
      const a = p.anchor;
      pending.current = { anchor: null, fit: null };
      const frame = el.querySelector<HTMLElement>(`[${WALL_SHEET_ATTR}="${CSS.escape(a.id)}"]`);
      if (frame) {
        const origin = el.getBoundingClientRect();
        const r = frame.getBoundingClientRect();
        el.scrollLeft = Math.max(0, r.left - origin.left + el.scrollLeft + a.fx * r.width - a.cx);
        el.scrollTop = Math.max(0, r.top - origin.top + el.scrollTop + a.fy * r.height - a.cy);
      }
    }
    setWallLayout(readWallLayout(el));
  }, [scroller, k, tick]);

  const api = useRef<WallZoomApi | null>(null);
  api.current = {
    zoomIn: () => { zoomTo(stepZoom(useWallZoom.getState().k, 1)); },
    zoomOut: () => { zoomTo(stepZoom(useWallZoom.getState().k, -1)); },
    fit: () => {
      useWallZoom.setState({ current: null, reading: false });
      startFit(null);
    },
    trueSize: () => {
      const id = referenceSheetId();
      const sheet = useProjectStore.getState().sheets.find((s) => s.id === id);
      if (sheet) zoomTo(trueSizeZoom(useWallZoom.getState().k, SHEET_PX * useWallZoom.getState().k, paperOf(sheet).w));
    },
    zoomToSheet: (id) => {
      useWallZoom.setState({ current: id, reading: true });
      startFit([id]);
    },
  };
  const stable = useMemo<WallZoomApi>(() => ({
    zoomIn: () => api.current?.zoomIn(),
    zoomOut: () => api.current?.zoomOut(),
    fit: () => api.current?.fit(),
    trueSize: () => api.current?.trueSize(),
    zoomToSheet: (id) => api.current?.zoomToSheet(id),
  }), []);

  /** Walk to the sheet `dir` along from the reference one, at the zoom it is at. */
  const walk = (dir: 1 | -1): void => {
    const order = useWallView.getState().layout?.sheets.map((s) => s.id) ?? [];
    const id = neighbourSheet(order, referenceSheetId(), dir);
    const placed = useWallView.getState().layout?.sheets.find((s) => s.id === id);
    if (!id || !placed) return;
    useWallZoom.setState({ current: id });
    scrollWallTo({ x: placed.rect.x + placed.rect.w / 2, y: placed.rect.y + placed.rect.h / 2 });
  };

  // The wheel, the drag and the keys read the latest of these through a ref, so they bind once.
  const live = useRef({ zoomTo, walk });
  live.current = { zoomTo, walk };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const useState = useWallZoom.getState;
    const onWheel = (e: WheelEvent) => {
      // Shift and the wheel scrolls sideways, as it always did.
      if (e.shiftKey && !e.ctrlKey) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 33 : 1;
      const f = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015));
      live.current.zoomTo(useState().k * f, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    const onScroll = () => useWallZoom.setState({ left: el.scrollLeft, top: el.scrollTop });
    el.addEventListener('scroll', onScroll, { passive: true });

    let space = false;
    let drag: { x: number; y: number; left: number; top: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const onThing = target?.closest(`[${WALL_SHEET_ATTR}], button, a, input, select, textarea, [data-owns-keys]`);
      if (e.button === 1 || (e.button === 0 && (space || !onThing))) {
        drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        capturePointer(el, e.pointerId);
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      el.scrollLeft = drag.left - (e.clientX - drag.x);
      el.scrollTop = drag.top - (e.clientY - drag.y);
      if (useState().reading) useWallZoom.setState({ reading: false });
    };
    const onUp = () => { drag = null; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || keysBelongElsewhere(e.target) || openKeyboardOverlay()) return;
      if (e.key === ' ') {
        space = e.type === 'keydown';
        el.toggleAttribute('data-panning', space);
        return;
      }
      if (e.type === 'keyup') return;
      const mod = e.ctrlKey || e.metaKey;
      const act = api.current;
      let run: (() => void) | null = null;
      if (e.key === '+' || e.key === '=') run = () => act?.zoomIn();
      else if (e.key === '-' || e.key === '_') run = () => act?.zoomOut();
      else if (e.key === '0') run = () => act?.fit();
      else if (!mod && e.key === '1') run = () => act?.trueSize();
      else if (!mod && (e.key === 'z' || e.key === 'Z')) {
        const id = referenceSheetId();
        if (id) run = () => act?.zoomToSheet(id);
      } else if (!mod && e.key === 'PageDown') run = () => live.current.walk(1);
      else if (!mod && e.key === 'PageUp') run = () => live.current.walk(-1);
      else if (!mod && useState().reading && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) run = () => live.current.walk(1);
      else if (!mod && useState().reading && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) run = () => live.current.walk(-1);
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // Back from a sheet: the Wall as it was left.
    el.scrollLeft = useState().left;
    el.scrollTop = useState().top;

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [scroller]);

  return stable;
}

const useTick = (): [number, () => void] => {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  return [n, bump];
};
