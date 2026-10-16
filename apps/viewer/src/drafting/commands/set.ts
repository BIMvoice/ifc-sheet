/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The commands of the whole drawing set, not of one drawing: CHECKSET (what is
 * missing), DRAFTSET (make the set whole for the model) and ISSUE (draw the
 * sheets and hand them over). They say what they did to the command history.
 * ISSUE draws sheets with the Wall's own paper, so it is loaded when it is
 * asked for: the drafting session does not carry the sheet UI, the printer and
 * the zipper with it.
 */

import { currentFindings } from '@/check/collect';
import { checkLines } from '@/check/say';
import { makeDraftSet } from '@/draft-set/run';
import { useProjectStore } from '@/project/project-store';
import type { DraftCommandDef } from './types';

const noCreate: DraftCommandDef['create'] = () => ({ prompt: () => ({ key: 'check.cmd' }), input: () => 'point', basePoint: () => null, onEnter: () => 'done' });

export const checkSetCommand: DraftCommandDef = {
  id: 'checkset',
  aliases: ['CHECKSET'],
  labelKey: 'check.cmd',
  projectWide: true,
  create: noCreate,
  run(ctx) {
    for (const text of checkLines(currentFindings(), useProjectStore.getState().sheets)) ctx.say('check.msg.line', { text });
  },
};

export const draftSetCommand: DraftCommandDef = {
  id: 'draftset',
  aliases: ['DRAFTSET', 'DRAFT-SET'],
  labelKey: 'draftSet.cmd',
  projectWide: true,
  create: noCreate,
  run(ctx) {
    for (const l of makeDraftSet().lines) ctx.say(l.key, l.params);
  },
};

export const issueCommand: DraftCommandDef = {
  id: 'issue',
  aliases: ['ISSUE'],
  labelKey: 'issue.cmd',
  projectWide: true,
  takesArgs: true,
  create: noCreate,
  run(ctx, args) {
    // The work is asynchronous: the command returns at once and the lines arrive as the sheets are drawn.
    void import('@/issue/run').then(
      ({ runIssueCommand }) => runIssueCommand(args, ctx.say),
      (err: unknown) => ctx.say('issue.msg.line', { text: err instanceof Error ? err.message : String(err) }),
    );
  },
};
