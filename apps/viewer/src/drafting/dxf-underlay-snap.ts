/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The lines of a view's DXF underlays as snap shapes (#547), beside the model's: the cursor snaps to their ends, middles, crossings and
 * nearest points as it does to the model's linework. A layer that is off offers none. They belong to no element: the model picker and
 * the dimension anchors skip them (owner -1).
 */

import { dxfUnderlayRuns, dxfUnderlaysOfView, type ViewDxfUnderlay } from '@bimvoice/ifcsheet/underlay';
import { SnapIndex } from './snaps';
import type { ReferenceSet } from './references';
import type { DraftShape } from './types';

/** The line shapes of the visible layers of the view's DXF underlays, in drawing coordinates. */
export function dxfSnapShapes(all: readonly ViewDxfUnderlay[] | undefined, viewId: string): DraftShape[] {
  const shapes: DraftShape[] = [];
  for (const u of dxfUnderlaysOfView(all, viewId)) {
    for (const run of dxfUnderlayRuns(u)) {
      for (let i = 1; i < run.points.length; i++) {
        const a = run.points[i - 1];
        const b = run.points[i];
        if (a.x !== b.x || a.y !== b.y) shapes.push({ type: 'line', a, b });
      }
    }
  }
  return shapes;
}

/** `model` and the DXF's lines in one set (the DXF's have no owner: -1); `model` itself when there are none. */
export function withDxfSnapShapes(model: ReferenceSet | null, all: readonly ViewDxfUnderlay[] | undefined, viewId: string): ReferenceSet | null {
  const extra = dxfSnapShapes(all, viewId);
  if (extra.length === 0) return model;
  const shapes = [...(model?.shapes ?? []), ...extra];
  return { shapes, owners: [...(model?.owners ?? []), ...extra.map(() => -1)], index: new SnapIndex(shapes) };
}
