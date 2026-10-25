/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Answers a finding's request to look at model elements (`check/focus`): once this view's drawing is there, the
 * view zooms to fit the elements and they are highlighted. The elements are read from the providers the view
 * installs for the one-action commands (`viewElementsOf`, `roomsOf`), so a room is found the way a door is.
 */

import { useEffect, type RefObject } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { clearFocus, fitBox, focusBox, useFocusRequest } from '@/check/focus';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { roomsOf, viewElementsOf } from '@/drafting/session-providers';
import { renderIdGlobalId } from '@/project/element-guid';
import { selectPickedGlobalId, toggleGlobalIdInSelection } from '../viewport-selection';

/** The drawing's own first fit comes a moment after it is ready, and the providers are installed a render later: look after both. */
const SETTLE_MS = 400;

export function useFocusOnFinding(
  viewId: string,
  drawing: Drawing2D | null,
  axis: SectionAxisName,
  containerRef: RefObject<HTMLElement | null>,
  setViewTransform: (t: ViewTransform) => void,
): void {
  const request = useFocusRequest((s) => s.request);
  useEffect(() => {
    if (!request || request.viewId !== viewId || !drawing) return;
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      if (request.box) {
        clearFocus();
        const fit = focusBox([[request.box.min, request.box.max]]);
        if (fit) setViewTransform(fitBox(fit, el.getBoundingClientRect(), axis));
        return;
      }
      const wanted = new Set(request.guids);
      const found = [
        ...viewElementsOf().filter((e) => wanted.has(renderIdGlobalId(e.renderId) ?? '')).map((e) => ({ id: e.renderId, ring: e.ring })),
        ...roomsOf().filter((r) => wanted.has(r.guid)).map((r) => ({ id: r.renderId, ring: r.ring })),
      ];
      clearFocus();
      const box = focusBox(found.map((f) => f.ring));
      if (!box) return;
      selectPickedGlobalId(found[0].id);
      for (const f of found.slice(1)) toggleGlobalIdInSelection(f.id);
      const rect = el.getBoundingClientRect();
      setViewTransform(fitBox(box, rect, axis));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [request, drawing, viewId, axis, containerRef, setViewTransform]);
}
