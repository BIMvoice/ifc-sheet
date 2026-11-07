/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** How one command ended on one view, from what it added and said (#333, #707). */

import type { DimAllKey } from '../dimall/dimall.js';
import type { LevelAllKey } from '../levelall/levelall.js';
import type { TagAllKey } from '../tagall/tagall.js';
import type { AnnotateCommand } from './choices.js';

/** The keys the run itself says things with; the app's catalogue has them (`wall.annotate.reason.*`). */
export type ReasonKey = 'wall.annotate.reason.noDrawing' | 'wall.annotate.reason.failed' | 'wall.annotate.reason.nothing';

/** Every key a run can say: a command's own, or the run's reason. */
export type AnnotateKey = DimAllKey | TagAllKey | LevelAllKey | ReasonKey | 'drafting.msg.dimAllPlanOnly' | 'drafting.msg.dimAllNotOnDetail' | 'drafting.msg.tagAllNeedsTypes';

/** What a command said while it ran: a message key with its parameters. */
export interface Said {
  key: AnnotateKey;
  params?: Record<string, string | number>;
}

/**
 * How a command ended on a view: it added something; it found everything there already; or it did nothing, and
 * `messages[0]` says why (a command's own words: "works on a plan", "nothing to dimension", "not on a detail").
 */
export type Outcome = 'added' | 'already' | 'skipped';

export interface CommandResult {
  command: AnnotateCommand;
  outcome: Outcome;
  /** Drafted entities the command added to the view. */
  added: number;
  messages: Said[];
  /** How long the command took, milliseconds. */
  ms: number;
}

/** What the commands say when they find the view complete, with the count of what is there (absent: it counts none). */
const HAVE: Partial<Record<AnnotateKey, 'already' | 'count' | null>> = {
  'drafting.msg.tagAllHave': 'already',
  'drafting.msg.dimAllHave': null,
  'drafting.msg.levelAllHave': 'count',
};

const saysHave = (messages: readonly Said[]): boolean => messages.some((m) => m.key in HAVE);

export function outcomeOf(added: number, messages: readonly Said[]): Outcome {
  if (added > 0) return 'added';
  const have = messages.find((m) => m.key in HAVE);
  if (!have) return 'skipped';
  const counted = HAVE[have.key];
  // "Every door, window and room has its label already (0)" is a plan with nothing to label, not a plan that is done.
  return counted === null || counted === undefined ? 'already' : Number(have.params?.[counted] ?? 0) > 0 ? 'already' : 'skipped';
}

/** A plan with nothing to label is not "complete already": say that there is nothing, not the command's "has its label (0)". */
export function messagesOf(outcome: Outcome, messages: Said[]): Said[] {
  return outcome === 'skipped' && saysHave(messages) ? [{ key: 'wall.annotate.reason.nothing' }] : messages;
}
