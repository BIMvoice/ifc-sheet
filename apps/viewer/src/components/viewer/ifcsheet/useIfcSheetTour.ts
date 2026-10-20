/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The IfcSheet face's tour on the shared engine: shown once, on the first run,
 * and again whenever the header's help button asks. Ending it either way
 * (finished or dismissed) is remembered as seen, in the tours' own storage,
 * which never throws: a browser that cannot store just shows it again.
 */

import { useEffect } from 'react';
import { startTour } from '@/lib/tours/controller';
import { dismissNotice, isNoticeDismissed } from '@/lib/tours/storage';
import { useTourStore } from '@/lib/tours/tour-store';
import { IFCSHEET_TOUR_ID } from '@/lib/tours/tours/ifcsheet';

/** The storage id of "the user has seen the Wall's tour". */
export const IFCSHEET_TOUR_SEEN = 'ifcsheet-tour';

export function openIfcSheetTour(): void {
  startTour(IFCSHEET_TOUR_ID, 'panel');
}

/** Starts the tour on first run, and remembers it as seen when it ends. Returns the way to reopen it. */
export function useIfcSheetTour(): () => void {
  useEffect(() => {
    if (!isNoticeDismissed(IFCSHEET_TOUR_SEEN)) openIfcSheetTour();
    return useTourStore.subscribe((s, prev) => {
      if (prev.tourId === IFCSHEET_TOUR_ID && prev.status === 'running' && s.status !== 'running') dismissNotice(IFCSHEET_TOUR_SEEN);
    });
  }, []);
  return openIfcSheetTour;
}
