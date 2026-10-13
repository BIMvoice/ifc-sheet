/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
export const annotateAllEn = {
  'drafting.cmd.dimAll': 'DIMALL',
  'drafting.tool.dimAll': 'Dimension the plan',
  'drafting.msg.dimAllPlanOnly': 'DIMALL works on a plan.',
  'drafting.msg.dimAllNone': 'Nothing to dimension: no walls cut in this plan, or no facade with an opening or a cross wall.',
  'drafting.msg.dimAllHave': 'This plan has all its dimension strings already.',
  'drafting.msg.dimAllDone': 'Added {count} dimensions in {strings} strings. Facades with nothing to dimension: {skipped}.',
  'drafting.msg.dimAllHeads': '{count} strings run through the arrow or letter of a section mark; their figures keep clear of it, but you may want to move the mark.',
} as const satisfies Record<string, TranslationValue>;
