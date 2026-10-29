/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail level and hidden lines of a joinery type's schedule views (#449), written to the type in the project's catalogue
 * (`updateJoinery`, so the project file keeps them and every schedule that shows the type draws them). The rules are the engine's
 * (`@bimvoice/ifcsheet/project`).
 */

import { withHiddenLinesShown, withViewDetail, withViewLineHidden } from '@bimvoice/ifcsheet/project';
import type { JoineryViewDetail, JoinerySpec } from '@ifc-lite/create';
import { joineryEntry, updateJoinery } from './catalog';

function change(typeId: string, next: (spec: JoinerySpec) => JoinerySpec): void {
  const spec = joineryEntry(typeId);
  if (spec) updateJoinery(next(spec));
}

export const setViewDetail = (typeId: string, detail: JoineryViewDetail): void => change(typeId, (s) => withViewDetail(s, detail));
export const hideViewLine = (typeId: string, lineId: string): void => change(typeId, (s) => withViewLineHidden(s, lineId));
export const showHiddenViewLines = (typeId: string): void => change(typeId, withHiddenLinesShown);
