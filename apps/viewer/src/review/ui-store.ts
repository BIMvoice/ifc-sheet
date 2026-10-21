/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the reviewer is doing on screen, not part of the project: whether the
 * comment tool is armed, which pin is open (a click in the list steps into
 * its sheet and lights it).
 */

import { create } from 'zustand';

interface ReviewUi {
  /** The comment tool is armed: the next click on the paper pins a comment. */
  placing: boolean;
  /** The pin that is lit and open. */
  highlight: string | null;
}

export const useReviewUi = create<ReviewUi>()(() => ({ placing: false, highlight: null }));

export function setPlacing(placing: boolean): void {
  useReviewUi.setState(placing ? { placing, highlight: null } : { placing });
}

export function setHighlight(id: string | null): void {
  useReviewUi.setState({ highlight: id, placing: false });
}
