/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one way a plan of a storey is added to the project when its cut height
 * and its direction of view are chosen: the Project Navigator's "New plan"
 * dialog and "Add a drawing" both call it. `reflected` is a reflected ceiling
 * plan (looking up from the cut plane), and is saved in the project file.
 */

import { addProjectView } from './project-store';
import type { ProjectLevel } from './types';

/** A plan of `level` named `name`, cut `cutHeight` metres above its floor; the id of the view added. */
export function addStoreyPlan(level: ProjectLevel, name: string, cutHeight: number, reflected: boolean): string {
  return addProjectView({ kind: 'plan', name, level: { ...level, storeyGlobalIds: [...level.storeyGlobalIds] }, cutHeight, ...(reflected ? { reflected: true } : {}) });
}
