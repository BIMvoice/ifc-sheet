/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A running BIM tool (modeling command) on a floor-plan drawing tab: its
 * pointer routing (`useModelCommandBridge`) and its layers — the ghost
 * footprint, the command's own plan layer, the snap glyph, and the command
 * bar with its typed fields — all through `project/model-command-bridge.ts`.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { getCommandRuntime, useCommandRuntime } from '@/lib/commands/modeling/runtime';
import { routePlanPointer } from '@/components/viewer/plan/PlanPointer';
import { aimSessionAtPlan, localScreenMap, type LocalScreenMap } from '@/project/model-command-bridge';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import type { ProjectView } from '@/project/types';

const DOUBLE_CLICK_MS = 300;
const DOUBLE_CLICK_PX = 5;

interface BridgeParams {
  view: ProjectView;
  /** The view's work plane (a plan's level). */
  plane: SectionPlaneConfig | null;
  transform: ViewTransform;
  axis: SectionAxisName;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface ModelCommandBridge {
  map: LocalScreenMap | null;
  /** Feed a pointer event to the running BIM tool; false when none runs here. */
  feed(kind: 'move' | 'down' | 'up', e: React.PointerEvent): boolean;
}

export function useModelCommandBridge({ view, plane, transform, axis, containerRef }: BridgeParams): ModelCommandBridge {
  const { command, ctx } = useCommandRuntime();
  const workplane = command && view.kind === 'plan' && ctx?.workplane?.spec.kind !== 'section' ? ctx?.workplane ?? null : null;
  const map = useMemo(() => (workplane && plane ? localScreenMap(workplane, plane, transform, axis) : null), [workplane, plane, transform, axis]);
  const lastDown = useRef<{ t: number; x: number; y: number } | null>(null);

  // A tool running while another floor plan comes to the front follows it to that plan's storey.
  const running = command !== null;
  useEffect(() => {
    if (running && view.kind === 'plan') aimSessionAtPlan(view);
  }, [running, view]);

  const feed = (kind: 'move' | 'down' | 'up', e: React.PointerEvent): boolean => {
    if (!map || !getCommandRuntime().command) return false;
    const rect = containerRef.current?.getBoundingClientRect();
    const local = map.toLocal({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
    let detail = 1;
    if (kind === 'down') {
      // Pointer events carry no click count: count here, as the plan does.
      const prev = lastDown.current;
      const double = prev !== null && e.timeStamp - prev.t < DOUBLE_CLICK_MS
        && Math.abs(e.clientX - prev.x) < DOUBLE_CLICK_PX && Math.abs(e.clientY - prev.y) < DOUBLE_CLICK_PX;
      lastDown.current = double ? null : { t: e.timeStamp, x: e.clientX, y: e.clientY };
      detail = double ? 2 : 1;
    }
    return routePlanPointer(kind, {
      local,
      metresPerPixel: map.metresPerPixel,
      mods: { shiftKey: e.shiftKey, altKey: e.altKey, detail },
      snapping: useViewerStore.getState().snapEnabled,
      planSources: [],
    });
  };

  return { map, feed };
}
