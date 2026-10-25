/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting view's canvas style (#34): the view's one styler (`project/view-styler.ts`), the one its sheets, their PDF and
 * DXF and the view's DXF pen with, for the same graphics, graphic standard and model styles. A new styler whenever one of those
 * changes, or (for a preset with property rules) the models or their properties do.
 */

import { useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { ViewGraphics } from '@/project/types';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { graphicStandardOf } from '@/drafting/graphic-standard';
import { entityStyles } from '@/project/model-styles';
import { appViewStyler } from '@/project/view-styler';
import { viewCanvasStyler, type CanvasStyler } from '../drawing/canvas-item-style';

export function useViewCanvasStyler(graphics: ViewGraphics | undefined, drawing: Drawing2D | null): CanvasStyler {
  const standardId = useProjectStore((s) => s.graphicStandard);
  const projectModels = useProjectStore((s) => s.models);
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  // The model styles as the sheets read them (`useSheetContent`): a linked model drawn halftone is halftone here too.
  const styleOf = useMemo(() => entityStyles(useViewerStore.getState(), projectModels), [models, projectModels]);
  return useMemo(() => {
    void mutationVersion;
    return viewCanvasStyler(appViewStyler(graphics, drawing, graphicStandardOf(standardId), styleOf));
  }, [graphics, drawing, standardId, styleOf, models, mutationVersion]);
}
