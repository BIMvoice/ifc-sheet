/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** How the app reads the drafts of the view in front for the engine's planners (`@bimvoice/ifcsheet`, #707): its section links, its browser font and the view's screen. */

import type { DraftReader } from '@bimvoice/ifcsheet';
import { annotationScreenRight, annotationScreenUp } from '@/drafting/annotation';
import { sectionLink } from '@/drafting/section-symbol';
import { textWidthEm } from '@/drafting/text-width';

export function draftReader(): DraftReader {
  return { sectionLink, measure: { widthOf: textWidthEm, frame: { up: annotationScreenUp(), right: annotationScreenRight() } } };
}
