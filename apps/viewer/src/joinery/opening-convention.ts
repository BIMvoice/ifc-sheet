/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's door / window opening-symbol convention (`symbols.ts`), saved in the project file. */

import type { OpeningLineDirection } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import type { OpeningConvention } from './symbols';

/**
 * The convention a graphic standard's `openingLines` names (#448): `towardsHandle` is the 'handle' convention (apex at the handle, base on
 * the hinges), `towardsHinge` the 'hinge' one (the lines meet at the hinges). Choosing a standard stores this in the project
 * (`setGraphicStandard`); everything that draws opening lines reads the project's value, so there is one path.
 */
export const conventionOfDirection = (direction: OpeningLineDirection): OpeningConvention => (direction === 'towardsHinge' ? 'hinge' : 'handle');

export const openingConvention = (): OpeningConvention => useProjectStore.getState().openingLines ?? 'handle';

export const useOpeningConvention = (): OpeningConvention => useProjectStore((s) => s.openingLines ?? 'handle');

export function setOpeningConvention(convention: OpeningConvention): void {
  useProjectStore.setState({ openingLines: convention, dirty: true });
}
