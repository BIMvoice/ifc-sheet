/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The Polyline tool's Close and Undo last point buttons on its card, and the prompt that names them (#168). */
export const polylineCardEn = {
  'polylineCard.close': 'Close',
  'polylineCard.undo': 'Undo last point',
  'polylineCard.group': 'Polyline steps',
  'polylineCard.body': 'Click its corners; Close joins the end to the start, Done ends it. A closed polyline is a zone a hatch can fill.',
  'drafting.prompt.polylineNext': 'Specify next point [Close / Undo] (Enter to finish):',
  'plainHints.polylineNext': 'Click the next point. Close joins the end to the start, Undo last point takes back the last click. Choose Done when you are finished.',
} as const;
