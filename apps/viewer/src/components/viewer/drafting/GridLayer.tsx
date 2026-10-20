/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's structural grid on a plan, section or elevation tab
 * (`project/grid-overlay.ts`): the same overlay the sheet and the DXF carry,
 * drawn over the generated drawing in the theme's ink. Re-derived whenever the
 * model is edited, so the axes follow it.
 */

import { memo, useMemo } from 'react';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { gridOverlays } from '@/project/grid-overlay';
import { DEFAULT_VIEW_SCALE } from '@/project/viewport-annotation';
import type { ProjectView } from '@/project/types';
import { OverlayPaths } from '../sheets/OverlayPaths';

interface Props {
  view: ProjectView;
  /** The view's plane; null draws nothing. */
  plane: SectionPlaneConfig | null;
  drawing: Drawing2D | null;
  transform: ViewTransform;
  axis: SectionAxisName;
}

export const GridLayer = memo(function GridLayer({ view, plane, drawing, transform, axis }: Props) {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const overlays = useMemo(
    () => {
      void mutationVersion;
      void models;
      return plane ? gridOverlays(view, plane, drawing) : [];
    },
    [view, plane, drawing, mutationVersion, models],
  );
  if (overlays.length === 0) return null;
  // Paper millimetres to screen pixels at the view's scale.
  const paperMm = (transform.scale * (view.scale && view.scale > 0 ? view.scale : DEFAULT_VIEW_SCALE)) / 1000;
  return (
    <svg data-grid-layer className="absolute inset-0 h-full w-full pointer-events-none text-zinc-800 dark:text-zinc-200" aria-hidden="true">
      <OverlayPaths overlays={overlays} transform={transform} axis={axis} textScale={paperMm} ink="currentColor" />
    </svg>
  );
});
