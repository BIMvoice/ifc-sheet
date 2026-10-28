/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LevelsSection, useWantsUserLevels } from '../LevelsSection';
import type { DrawerSection } from './types';

/** The levels the person defines for a model with no storeys (a glTF/GLB): a plan each. Shown only for such a model. */
export const levelsSection: DrawerSection = {
  id: 'levels',
  slot: 'body',
  order: 550,
  component: ({ extent }) => <LevelsSection lowest={extent?.min.y ?? 0} />,
  useVisible: useWantsUserLevels,
};
