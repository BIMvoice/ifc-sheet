/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * IfcSheet's demo project: a five-storey block of flats (ground floor plus
 * four, "Bloc P+4"), served with the app from `public/samples`. Opening it
 * is opening a model like any other: the file goes to the canonical
 * `loadFile` through the `ifc-lite:load-file` event, and the Wall lays its
 * drawing set out as it does for a model the user picks.
 */

import { EVENT_LOAD_FILE } from '@/lib/tours/events';

export const DEMO_MODEL = { path: '/samples/bloc-p4.ifc', name: 'Bloc P+4.ifc' } as const;

let inFlight: Promise<void> | null = null;

/** Fetch the demo model and open it; a second click while it is on its way does not load it twice. */
export function openDemoModel(): Promise<void> {
  inFlight ??= fetch(DEMO_MODEL.path)
    .then(async (res) => {
      if (!res.ok) throw new Error(`demo model fetch failed: ${res.status} ${DEMO_MODEL.path}`);
      const file = new File([await res.blob()], DEMO_MODEL.name, { type: 'application/x-step' });
      window.dispatchEvent(new CustomEvent(EVENT_LOAD_FILE, { detail: file }));
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
