/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which way is "up on screen" in drawing y for the view an entity lives in,
 * read from the project, not from the drafting session: -1 on a plan and on a
 * sheet (drawing y points down the screen), +1 on a section and an elevation.
 * What is derived from an entity's text box is measured with it, so the
 * result does not depend on which view happens to be open.
 */

import { useProjectStore } from './project-store';
import { viewPlaneConfig } from './view-plane-config';

export function viewScreenUp(viewId: string, s = useProjectStore.getState()): 1 | -1 {
  if (s.sheets.some((sheet) => sheet.id === viewId)) return -1;
  const view = s.views.find((v) => v.id === viewId);
  if (!view || view.kind === 'plan') return -1;
  return viewPlaneConfig(view, s.levels, null)?.axis === 'y' ? -1 : 1;
}
