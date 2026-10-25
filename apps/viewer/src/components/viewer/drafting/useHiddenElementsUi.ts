/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The state of the drawing in front for hiding single elements and lines (#33): the "Show hidden" ghost, and "Hide a line", which
 * takes the next click for the line of the drawing under it (stopped by Escape).
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { screenToDrawing, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { hideLine, showElements, showLine } from '@/project/element-graphics-actions';
import { renderIdGlobalId } from '@/project/element-guid';
import { nearestModelLine } from '@/project/line-pick';
import type { ViewGraphics } from '@/project/types';
import { hiddenGhosts } from '@/project/view-element-filter';

interface Input {
  view: { id: string };
  /** The generator's drawing, whole: the ghosts come from it. */
  drawing: Drawing2D | null | undefined;
  /** What the view shows: the lines that can be picked. */
  shown: Pick<Drawing2D, 'lines'> | null;
  graphics: ViewGraphics | undefined;
  /** The loaded models (GlobalIds are read from them). */
  models: unknown;
  containerRef: RefObject<HTMLElement | null>;
  transform: ViewTransform;
  axis: SectionAxisName;
}

export function useHiddenElementsUi({ view, drawing, shown, graphics, models, containerRef, transform, axis }: Input) {
  const [showHidden, setShowHidden] = useState(false);
  const [pickingLine, setPickingLine] = useState(false);
  const ghosts = useMemo(() => (showHidden && drawing ? hiddenGhosts(drawing, graphics, renderIdGlobalId) : null), [showHidden, drawing, graphics, models]);
  // The click of "Hide a line": the line under it, hidden by its element's GlobalId and where it lies.
  const hideLineAt = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const p = screenToDrawing({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }, transform, axis);
    const hit = nearestModelLine(shown, p, 8 / transform.scale);
    const globalId = hit ? renderIdGlobalId(hit.entityId) : null;
    if (hit && globalId) hideLine(view.id, globalId, hit.line);
    setPickingLine(false);
  };
  useEffect(() => {
    if (!pickingLine) return undefined;
    const stop = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickingLine(false); };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, [pickingLine]);
  // A click on a ghost brings that element, or that line, back.
  const showElement = (globalId: string) => showElements(view.id, [globalId]);
  const showLineEntry = (entry: string) => showLine(view.id, entry);
  return { showHidden, setShowHidden, pickingLine, setPickingLine, ghosts, hideLineAt, showElement, showLineEntry };
}
