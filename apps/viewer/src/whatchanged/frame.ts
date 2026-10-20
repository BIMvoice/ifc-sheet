/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the render frame's origin lies in the file's own coordinates, Y-up metres. The geometry pass
 * subtracts it from every vertex (`CoordinateInfo.wasmRtcOffset` in IFC axes, `originShift`), so the views,
 * their planes and the model's bounds are in the render frame while the fingerprints' boxes
 * (`MeshData.geometryAabb`) are absolute. It is resolved by `resolveRenderFrame`, the rule the coordinate
 * readouts use, and added back by `renderToWorldViewer`, so there is one answer to where a point is.
 */

import { resolveRenderFrame } from '@/hooks/useRenderFrameOffsets';
import { renderToWorldViewer } from '@/components/viewer/tools/measure-modes/coordinates';
import { useViewerStore } from '@/store';

export function renderFrameOffset(): { x: number; y: number; z: number } {
  const viewer = useViewerStore.getState();
  return renderToWorldViewer({ x: 0, y: 0, z: 0 }, resolveRenderFrame(viewer.models, viewer.geometryResult));
}
