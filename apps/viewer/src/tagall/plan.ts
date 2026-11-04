/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL's planner is the engine's (`planTagAll`, #707); this fills in what only
 * the app has: the loaded models to read the elements from, the browser's text
 * measure and styles, the fonts and section links of the annotations drawn.
 */

import { planTagAll, type TagAllInputs, type TagAllResult } from '@bimvoice/ifcsheet';
import { draftReader } from '@/dimall/reader';
import { labelEnv } from '@/labels/label-all';
import { rectsOf } from '@/labels/label-annotations';
import type { ElementReader } from '@/labels/label-all';

export type AppTagAllInput = Omit<TagAllInputs, 'env' | 'reader' | 'rectsOf' | 'onPlan'> & {
  /** How the labels find their elements; absent: the loaded models'. */
  read?: ElementReader;
  /** Default: the view is a plan. */
  onPlan?: boolean;
};

/** TAGALL's complete inputs in the app: the engine's with the models' reader, the text measure and the section links filled in. */
export function tagAllInputsOf({ read, onPlan = true, ...input }: AppTagAllInput): TagAllInputs {
  return { ...input, onPlan, env: labelEnv(read), reader: draftReader(), rectsOf };
}

/** TAGALL planned in the app. */
export function planTagAllInApp(input: AppTagAllInput): TagAllResult {
  return planTagAll(tagAllInputsOf(input));
}
