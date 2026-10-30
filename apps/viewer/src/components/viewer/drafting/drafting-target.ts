/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import type { Pt } from '@/drafting/types';
import { screenSigns, type SectionAxisName, type ViewTransform } from '@/drafting/frame';

/**
 * A drafting target that is not a model view (a joinery type's front, plan or section, #492): the axis its coordinates run on, the box to
 * fit on opening, and what is drawn under the drafted shapes (the type's own lines). The view has no generated drawing, no model and no
 * plane; everything else, the commands, snaps, selection, undo and the command line, is this view's.
 */
export interface DraftingTarget {
  axis: SectionAxisName;
  fit: { min: Pt; max: Pt };
  underlay: (transform: ViewTransform) => ReactNode;
}

/** The transform that fits a target's box into most of a `width` x `height` area (screen y runs down; a front frame is y up, so the box's middle sits at `y - cy * ky * scale`). */
export function targetFitTransform(target: DraftingTarget, width: number, height: number): ViewTransform {
  const { min, max } = target.fit;
  const scale = Math.max(1, Math.min((width * 0.8) / Math.max(max.x - min.x, 1e-6), (height * 0.8) / Math.max(max.y - min.y, 1e-6)));
  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2;
  const { kx, ky } = screenSigns(target.axis);
  return { scale, x: width / 2 - cx * kx * scale, y: height / 2 - cy * ky * scale };
}
