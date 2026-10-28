/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The generated drawing of a view as the view stores it for its tab and its sheets (`ViewDrawingHost`): what the view
 * shows of it (`drawingAsViewShows`), and, for a discipline plan, framed on the elements its filter keeps (#257). One
 * function, so the host and its test take the same path.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewOmits } from './discipline-facts';
import { drawingAsViewShows } from './view-appearance';
import type { ProjectView } from './types';

export function drawingShownBy(view: ProjectView, generated: Drawing2D): Drawing2D {
  const omits = view.kind === 'plan' && view.discipline ? viewOmits(view) : undefined;
  return drawingAsViewShows(generated, {
    kind: view.kind, showHidden: view.showHidden, detail: view.detail, interior: view.kind === 'elevation' ? view.interior : undefined,
    ...(omits ? { omits } : {}),
  });
}
