/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing: a finding about model elements brings the view here, zoomed to them and with them selected. */

import { useEffect, type RefObject } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { drawingToScreen, type SectionAxisName } from '@/drafting/frame';
import { clearFocus, focusBox, useFocusRequest } from '@/check/focus';
import { roomsOf } from '@/drafting/session-providers';
import { renderIdGlobalId } from '@/project/element-guid';
import { viewElements } from '@/labels/view-elements';
import { selectPickedGlobalId, toggleGlobalIdInSelection } from '@/components/viewer/viewport-selection';

interface Transform { scale: number; x: number; y: number }

export function useFocusView(viewId: string, drawing: Drawing2D | null, axis: SectionAxisName, containerRef: RefObject<HTMLDivElement | null>, setViewTransform: (t: Transform) => void): void {
  const request = useFocusRequest((s) => s.request);
  useEffect(() => {
    if (!request || request.viewId !== viewId || !drawing) return;
    // The drawing's own first fit comes a moment after it is ready; look after it.
    const timer = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const wanted = new Set(request.guids);
      const found = [
        ...viewElements(drawing).filter((e) => wanted.has(renderIdGlobalId(e.renderId) ?? '')).map((e) => ({ id: e.renderId, ring: e.ring })),
        ...roomsOf().filter((r) => wanted.has(r.guid)).map((r) => ({ id: r.renderId, ring: r.ring })),
      ];
      clearFocus();
      const box = focusBox(found.map((f) => f.ring));
      if (!box) return;
      selectPickedGlobalId(found[0].id);
      for (const f of found.slice(1)) toggleGlobalIdInSelection(f.id);
      const rect = el.getBoundingClientRect();
      const scale = 0.85 * Math.min(rect.width / (box.max.x - box.min.x), rect.height / (box.max.y - box.min.y));
      const at = drawingToScreen({ x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 }, { scale, x: 0, y: 0 }, axis);
      setViewTransform({ scale, x: rect.width / 2 - at.x, y: rect.height / 2 - at.y });
    }, 400);
    return () => clearTimeout(timer);
  }, [request, drawing, viewId, axis, containerRef, setViewTransform]);
}
