/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The context a drafting command runs with, built from what the view gives it
 * (`ViewInputs`) and the session around it. The session builds it for the view
 * in front; the batch that annotates the set (#333) builds it for a view that
 * is not open. One builder, so a command sees the same fields either way.
 */

import type { TranslationKey } from '@/i18n';
import type { DraftContext, DraftSettings } from './commands/types';
import type { ViewInputs } from './view-inputs';
import type { DraftEntity, DraftShape, Pt } from './types';
import type { SectionAxisName } from './frame';

/** What a command reads that only the view in front has: the snap shapes and the model picker. */
export interface InteractiveInputs {
  referenceShapes(min: Pt, max: Pt): DraftShape[];
  elementAt(p: Pt): number | null;
}

/** What the session around the command gives it. */
export interface ContextEnv {
  layerId: string;
  axis: SectionAxisName;
  settings: DraftSettings;
  entities(): DraftEntity[];
  selection(): ReadonlySet<string>;
  setSelection(ids: ReadonlySet<string>): void;
  say(key: TranslationKey, params?: Record<string, string | number>): void;
}

export function makeContext(viewId: string, inputs: ViewInputs & InteractiveInputs, env: ContextEnv): DraftContext {
  const kx = env.axis === 'side' ? -1 : 1;
  const ky = env.axis !== 'down' ? -1 : 1;
  return {
    viewId,
    layerId: env.layerId,
    entities: env.entities,
    ...inputs,
    selection: env.selection,
    setSelection: env.setSelection,
    // userToDrawing is diag(kx, −ky): orientation-reversing when its determinant is negative.
    orientation: (kx * -ky) > 0 ? 1 : -1,
    settings: env.settings,
    say: env.say,
  };
}

/** Which way text and marks grow and which way x runs on screen, for a view cut on `axis`: plans draw drawing-y downward on screen, a side view is mirrored. */
export function annotationFrameOf(axis: SectionAxisName): { up: 1 | -1; right: 1 | -1 } {
  return { up: axis === 'down' ? -1 : 1, right: axis === 'side' ? -1 : 1 };
}
