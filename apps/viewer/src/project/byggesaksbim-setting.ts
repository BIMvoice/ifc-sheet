/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useProjectStore } from './project-store';

/** Opts the project in to the ByggesaksBIM (Norway) readiness check, or out again; off is stored as absent (`fields/byggesaksbim.ts`). */
export function setByggesaksbim(on: boolean): void {
  if (on !== (useProjectStore.getState().byggesaksbim === true)) useProjectStore.setState({ byggesaksbim: on ? true : undefined, dirty: true });
}
