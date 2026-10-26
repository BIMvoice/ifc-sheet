/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The state the checks read, by store and key (`collect.ts` reads the project store, the plan drawings and the loaded
 * models; `roomsOfPlan` reads the drawing runtime's geometry). The list is what `watchFindingInputs` watches, so the
 * list is the whole of "when does the list of what is missing recompute": a key outside it never does. `inputs.test.ts`
 * runs the checks over the FZK model with every store's reads recorded and fails on a key that is not listed here, so a
 * check that starts reading new state cannot leave the list stale without a red test.
 */

import type { useProjectStore } from '@/project/project-store';
import type { useViewDrawings } from '@/project/view-drawings';
import type { useViewerStore } from '@/store';

type Keys<S extends { getState(): object }> = readonly (keyof ReturnType<S['getState']> & string)[];

export const FINDING_INPUTS = {
  /** Sheets, views, drafts (tags, labels, level marks, dimensions), the title block (typed values, mapping, project name), the levels the rooms are read by, the recorded model state a gone element is named from, and the tag-field mapping the label reader builds an element with (the title block's model facts are read through it). */
  project: ['views', 'sheets', 'drafts', 'name', 'titleBlock', 'titleBlockSources', 'levels', 'modelState', 'tagFields'] satisfies Keys<typeof useProjectStore>,
  /** What a drawn plan shows (the doors, windows and rooms a tag or label could be on). */
  viewDrawings: ['byView'] satisfies Keys<typeof useViewDrawings>,
  /** The loaded models, and the edits that add or remove an element (`mutationViews` is replaced in place; `mutationVersion` is what moves), and the render-id to GlobalId lookup the plan's elements are named by. */
  viewer: ['models', 'mutationViews', 'mutationVersion', 'resolveGlobalIdFromModels'] satisfies Keys<typeof useViewerStore>,
  /** The drawing runtime's geometry is not a store: `subscribeDrawingRuntime` tells when it is published again. */
  runtime: true,
} as const;
