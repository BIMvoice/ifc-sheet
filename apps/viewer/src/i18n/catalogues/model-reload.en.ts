/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Reload the IFC model with the project kept (#922, `whatchanged/reload.ts`). */
export const modelReloadEn = {
  'modelReload.cmd': 'RELOADMODEL',
  'modelReload.action': 'Reload the IFC model',
  'modelReload.reloading': 'Reloading the model…',
  'modelReload.hint': 'Bring in the model as it was saved again in its authoring tool. The project, its sheets, views and annotations stay and are drawn on the new version.',
  'modelReload.busy': 'A model is still loading. Reload it when it has finished.',
  'modelReload.noModel': 'No model is loaded to reload.',
  'modelReload.federation': 'Several models are loaded. Reload works on a project drawn from one model.',
  'modelReload.notCompared': 'The new model is in, but what changed in it could not be found.',
  'modelReload.done': {
    one: '{file} reloaded. The project is kept; {count} element changed.',
    other: '{file} reloaded. The project is kept; {count} elements changed.',
  },
  'modelReload.lost': {
    one: '{count} annotation lost its element. It is kept, and What changed lists it.',
    other: '{count} annotations lost their element. They are kept, and What changed lists them.',
  },
  'modelReload.failed': 'The model could not be reloaded: {reason}',
  'modelReload.show': 'What changed',
} as const satisfies Record<string, TranslationValue>;
