/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reads the Wall's scroller into `useWallView` (where the sheets lie, what is
 * on screen) as it scrolls, resizes or gains or loses sheets, and carries out
 * the scrolls the search box and the corner map ask for.
 */

import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { scrollToCentre } from '@/wall/wall-geometry';
import { setWallLayout, useWallView, type WallLayout } from '@/wall/wall-view';

/** Marks each sheet's frame on the Wall, for measuring. */
export const WALL_SHEET_ATTR = 'data-wall-sheet';

export function readWallLayout(scroller: HTMLElement): WallLayout {
  const origin = scroller.getBoundingClientRect();
  const sheets = [...scroller.querySelectorAll<HTMLElement>(`[${WALL_SHEET_ATTR}]`)].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute(WALL_SHEET_ATTR) ?? '', rect: { x: r.left - origin.left + scroller.scrollLeft, y: r.top - origin.top + scroller.scrollTop, w: r.width, h: r.height } };
  });
  return {
    sheets,
    viewport: { x: scroller.scrollLeft, y: scroller.scrollTop, w: scroller.clientWidth, h: scroller.clientHeight },
    content: { w: scroller.scrollWidth, h: scroller.scrollHeight },
  };
}

/** `sheetIds` changing (one added, one taken away) measures again. */
export function useWallMeasure(scroller: RefObject<HTMLElement | null>, sheetIds: string): void {
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setWallLayout(readWallLayout(el));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      setWallLayout(null);
    };
  }, [scroller, sheetIds]);

  const request = useWallView((s) => s.scroll);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !request) return;
    const { left, top } = scrollToCentre(request.to, { w: el.clientWidth, h: el.clientHeight }, { w: el.scrollWidth, h: el.scrollHeight });
    // A jump, not a glide: sheets passed on the way would otherwise all come near and be drawn.
    el.scrollTo({ left, top });
    // Done: a Wall mounted later (back from a sheet) must not repeat it.
    useWallView.setState({ scroll: null });
  }, [scroller, request]);
}
