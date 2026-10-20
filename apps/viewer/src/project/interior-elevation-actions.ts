/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "Interior elevations" command on a room: its elevations added to the
 * project and hung on one sheet together, as one undo step.
 */

import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import { useViewerStore } from '@/store';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { renderIdGlobalId } from './element-guid';
import { interiorElevationSheet, interiorElevationViews, type InteriorElevationView } from './interior-elevations';
import { roomGeometry, roomLabel } from './interior-room';
import { addProjectView, useProjectStore } from './project-store';

export type InteriorElevationsResult = { sheetId: string; sheetNumber: string; count: number } | { error: 'noRoom' | 'noFaces' };

/** The IfcSpace node `expressId` of a spatial tree, walked without recursion. */
function spaceNode(root: SpatialNode, expressId: number): SpatialNode | null {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.expressId === expressId && node.type === IfcTypeEnum.IfcSpace) return node;
    stack.push(...node.children);
  }
  return null;
}

/** The name the views of the room with render id `renderId` carry. */
function labelOf(renderId: number): string {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(renderId);
  const store = ref ? s.models.get(ref.modelId)?.ifcDataStore : undefined;
  const node = ref && store?.spatialHierarchy ? spaceNode(store.spatialHierarchy.project, ref.expressId) : null;
  return roomLabel(node?.name ?? (ref ? store?.entities.getName(ref.expressId) : undefined), node?.longName, `Room ${ref?.expressId ?? renderId}`);
}

/** Make the interior elevations of the room drawn with render id `renderId` and hang them on a new sheet. */
export function createInteriorElevations(renderId: number): InteriorElevationsResult {
  const guid = renderIdGlobalId(renderId);
  const geometry = roomGeometry(currentDrawingRuntime().geometryResult?.meshes ?? [], renderId);
  if (!guid || !geometry) return { error: 'noRoom' };
  const label = labelOf(renderId);
  const views = interiorElevationViews({ guid, label, ...geometry });
  if (views.length === 0) return { error: 'noFaces' };
  return addInteriorElevations(label, views);
}

/** Add a room's interior elevations `views` to the project and hang them on a new sheet of their own, as one undo step. */
export function addInteriorElevations(label: string, views: readonly InteriorElevationView[]): { sheetId: string; sheetNumber: string; count: number } {
  const sheet = interiorElevationSheet(label, views, useProjectStore.getState().sheets);
  const scale = sheet.viewports?.[0]?.scale;
  runAsOneUndoStep(() => {
    for (const view of views) addProjectView({ ...view, scale });
    useProjectStore.setState({ sheets: [...useProjectStore.getState().sheets, sheet], dirty: true });
  });
  return { sheetId: sheet.id, sheetNumber: sheet.number, count: views.length };
}
