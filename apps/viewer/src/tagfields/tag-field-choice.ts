/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's choice of what the TAG tool shows (`project/fields/tag-field.ts`, #676). The mark, the default, is stored as absent. */

import { useProjectStore } from '@/project/project-store';
import type { TagField } from './element-tag';

export function setTagFieldChoice(field: TagField): void {
  const next = field === 'mark' ? undefined : field;
  if (next !== useProjectStore.getState().tagField) useProjectStore.setState({ tagField: next, dirty: true });
}
