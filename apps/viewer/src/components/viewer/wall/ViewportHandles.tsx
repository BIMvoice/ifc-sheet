/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The grips of the chosen drawing on a stepped-into sheet (#139): four corners
 * and four edges. Dragging one resizes the crop box (`project/viewport-resize`):
 * the drawing keeps its scale and its place on the paper, the box shows more or
 * less of it. A drag is one undo step; Esc puts the box back. A focused grip
 * moves its edge with the arrow keys (1 mm, Shift 10 mm). The grips keep their
 * keys (`data-owns-keys`), so Esc on one is not the sheet's Esc.
 */

import { useRef } from 'react';
import { useProjectStore } from '@/project/project-store';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useTranslation } from '@/i18n';
import { capturePointer } from '@/lib/pointer-capture';
import { resizedFrame, RESIZE_HANDLES, sheetDrawingArea, type ResizeHandle, type ViewportFrame } from '@/project/viewport-resize';
import { updateViewport } from '@/project/sheets';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { AXIS_NAME, viewportTransform } from '../sheets/SheetPaper';

interface Pan { x: number; y: number; k: number }

interface Props {
  sheet: ProjectSheet;
  vp: SheetViewport;
  box: { width: number; height: number };
  drawing: Drawing2D | null;
  pan: Pan;
}

const GRIP_PX = 12;
const CURSOR: Record<ResizeHandle, string> = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' };
const ARROW: Record<string, { x: number; y: number }> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

/** Where each grip sits on the box, as fractions of its width and height. */
const AT: Record<ResizeHandle, { x: number; y: number }> = {
  nw: { x: 0, y: 0 }, n: { x: 0.5, y: 0 }, ne: { x: 1, y: 0 }, e: { x: 1, y: 0.5 }, se: { x: 1, y: 1 }, s: { x: 0.5, y: 1 }, sw: { x: 0, y: 1 }, w: { x: 0, y: 0.5 },
};

export function ViewportHandles({ sheet, vp, box, drawing, pan }: Props) {
  const { t } = useTranslation();
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: ResizeHandle; vp: SheetViewport; box: { width: number; height: number }; sheet: ProjectSheet } | null>(null);

  /** Frame maths for the viewport as it is now: the drawing's place on the paper, which a resize must not change. */
  const frameFor = (handle: ResizeHandle, current: SheetViewport, size: { width: number; height: number }, to: { x: number; y: number }): ViewportFrame => {
    const axis = drawing ? AXIS_NAME[drawing.config.plane.axis] : 'down';
    const tr = viewportTransform(current, drawing, axis);
    return resizedFrame(current, size, handle, to, sheetDrawingArea(sheet), { x: tr.x, y: tr.y }, { x: axis === 'side' ? -1 : 1, y: axis !== 'down' ? -1 : 1 });
  };
  const toPaper = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = layer.current?.getBoundingClientRect();
    return { x: (e.clientX - (rect?.left ?? 0) - pan.x) / pan.k, y: (e.clientY - (rect?.top ?? 0) - pan.y) / pan.k };
  };
  const restore = (): void => {
    const d = drag.current;
    drag.current = null;
    // The very sheet object the drag started from, not a copy: a later undo step recognises the sheet it left behind by identity.
    if (d) useProjectStore.setState((s) => ({ sheets: s.sheets.map((o) => (o.id === d.sheet.id ? d.sheet : o)) }));
  };

  const onPointerDown = (handle: ResizeHandle) => (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.focus();
    capturePointer(e.currentTarget, e.pointerId);
    drag.current = { handle, vp, box, sheet };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (!d) return;
    // Absolute from where the drag started, against the viewport as it was then: the frame does not drift.
    updateViewport(sheet.id, vp.id, frameFor(d.handle, d.vp, d.box, toPaper(e)));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (!d) return;
    const next = frameFor(d.handle, d.vp, d.box, toPaper(e));
    restore();
    // The live drag wrote the sheet step by step; the history gets the one change, from the start to the end.
    if (next.width !== d.box.width || next.height !== d.box.height) runAsOneUndoStep(() => updateViewport(sheet.id, vp.id, next));
  };
  const onKeyDown = (handle: ResizeHandle) => (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'Escape') {
      if (drag.current) restore();
      else e.currentTarget.blur();
      return;
    }
    const arrow = ARROW[e.key];
    if (!arrow || drag.current) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const edge = { x: handle.includes('w') ? vp.x - box.width / 2 : vp.x + box.width / 2, y: handle.includes('n') ? vp.y - box.height / 2 : vp.y + box.height / 2 };
    const next = frameFor(handle, vp, box, { x: edge.x + arrow.x * step, y: edge.y + arrow.y * step });
    if (next.width !== box.width || next.height !== box.height) runAsOneUndoStep(() => updateViewport(sheet.id, vp.id, next));
  };

  const left = pan.x + (vp.x - box.width / 2) * pan.k;
  const top = pan.y + (vp.y - box.height / 2) * pan.k;
  return (
    <div ref={layer} data-owns-keys className="pointer-events-none absolute inset-0">
      {RESIZE_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={t(`wall.vp.resize.${handle}`)}
          title={t(`wall.vp.resize.${handle}`)}
          data-viewport-grip={handle}
          className="pointer-events-auto absolute rounded-sm border border-blue-600 bg-white p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          style={{ left: left + AT[handle].x * box.width * pan.k - GRIP_PX / 2, top: top + AT[handle].y * box.height * pan.k - GRIP_PX / 2, width: GRIP_PX, height: GRIP_PX, cursor: `${CURSOR[handle]}-resize`, touchAction: 'none' }}
          onPointerDown={onPointerDown(handle)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={restore}
          onKeyDown={onKeyDown(handle)}
        />
      ))}
    </div>
  );
}
