/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project page the "Star on GitHub" links point to (#655). */
export const STAR_URL = 'https://github.com/BIMvoice/ifc-sheet';

const FLAG = 'ifcsheet.starReminderShown';

/**
 * True the first time it is asked after a successful issue in this browser, and false ever after. The flag is
 * set as the reminder is shown, so closing it or following its link needs no second write. A store that is
 * blocked or throws means no reminder, never an error. No network call.
 */
export function takeStarReminder(): boolean {
  try {
    if (localStorage.getItem(FLAG) !== null) return false;
    localStorage.setItem(FLAG, '1');
    return true;
  } catch (err) {
    console.warn('The star reminder is skipped: local storage is not available.', err);
    return false;
  }
}
