/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which actions a model tree row offers, and the room action's target. */

import { useViewerStore, toGlobalIdFromModels } from '@/store';
import type { HierarchyRowAction } from './HierarchyRowActions';
import type { TreeNode } from './types';

/** The actions of `node`'s row; `hasElements`: it has elements to isolate. */
export function hierarchyRowActions(node: TreeNode, hasElements: boolean): HierarchyRowAction[] {
  if (node.type === 'model-header' || node.type === 'model-tag-group') return [];
  if (node.type === 'unified-storey' || node.type === 'IfcBuildingStorey') return ['solo', 'filter'];
  const actions: HierarchyRowAction[] = [];
  if (hasElements) actions.push('isolate');
  if (node.type === 'type-group' || node.type === 'ifc-type' || node.type === 'material-group' || node.type === 'group') actions.push('filter');
  // A room's walls as interior elevations: the model tree lists rooms even while spaces are hidden in 3D.
  if (node.type === 'IfcSpace' && node.expressIds.length === 1) actions.push('interiorElevations');
  return actions;
}

/** The render id of a room row's space. */
export function spaceRowRenderId(node: TreeNode): number {
  return toGlobalIdFromModels(useViewerStore.getState().models, node.modelIds[0] ?? 'legacy', node.expressIds[0]);
}
