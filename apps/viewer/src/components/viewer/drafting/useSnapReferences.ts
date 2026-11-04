/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { withDxfSnapShapes } from '@/drafting/dxf-underlay-snap';
import { referenceSet } from '@/drafting/references';
import { useProjectStore } from '@/project/project-store';

/**
 * What the cursor snaps to in a view: the generated drawing's lines and the lines of the layers that are on of the view's DXF
 * underlays (#547). Null when there is neither.
 */
export function useSnapReferences(drawing: Drawing2D | null | undefined, viewId: string) {
  const dxf = useProjectStore((s) => s.dxfUnderlays);
  return useMemo(() => withDxfSnapShapes(drawing ? referenceSet(drawing, false) : null, dxf, viewId), [drawing, dxf, viewId]);
}
