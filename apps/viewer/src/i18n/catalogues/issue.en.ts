/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
export const issueEn = {
  'issue.section': 'Issue the set',
  'issue.name': 'Issue name',
  'issue.pdf': 'Issue as PDF',
  'issue.svgZip': 'SVG, zipped',
  'issue.dxfZip': 'DXF, zipped',
  'issue.csv': 'Drawing list (CSV)',
  'issue.listFirst': 'Drawing list as first page',
  'issue.list.title': 'Drawing list',
  'issue.list.issue': 'Issue',
  'issue.list.date': 'Date',
  'issue.list.sheet': 'Sheet',
  'issue.list.sheetTitle': 'Title',
  'issue.list.scale': 'Scale',
  'issue.list.paper': 'Paper',
  'issue.list.revision': 'Revision',
  'issue.reason.empty': 'Sheet {number} has nothing on it, so it is not in the issue.',
  'issue.msg.nothing': 'There is nothing to issue: no sheet has a drawing on it.',
  'issue.msg.working': 'Issuing {count} sheets. Each sheet is opened in turn to draw it.',
  'issue.msg.done': 'Issued "{name}" ({date}): {count} sheets as {format}. The issue is recorded with the project.',
  'issue.msg.line': '{text}',
  'issue.msg.noCapture': 'Sheet {number} could not be drawn.',
  'issue.msg.viewError': 'Sheet {number}: the drawing of "{view}" could not be generated ({message}).',
  'issue.msg.viewTimeout': 'Sheet {number}: "{view}" was not drawn within {seconds} seconds.',
  'issue.msg.notIssued': 'Nothing was issued and nothing was recorded.',
} as const satisfies Record<string, TranslationValue>;
