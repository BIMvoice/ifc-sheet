/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { EvaluatedCost } from './cost-evaluation-arithmetic.js';

export interface ValueEvaluationSession {
  memo: Map<number, EvaluatedCost>;
  categoryMemo: Map<string, EvaluatedCost>;
  state: Map<number, 1 | 2>;
  budget: ValueEvaluationBudget;
  work: number;
  locallyExhausted: boolean;
  readonly exhausted: boolean;
  owner: number;
}

export interface ValueEvaluationBudget {
  work: number;
  exhausted: boolean;
}

export function valueEvaluationBudget(): ValueEvaluationBudget {
  return { work: 0, exhausted: false };
}

export function valueEvaluationSession(
  owner: number,
  budget: ValueEvaluationBudget = valueEvaluationBudget(),
): ValueEvaluationSession {
  return {
    memo: new Map(), categoryMemo: new Map(), state: new Map(), budget, owner,
    work: 0, locallyExhausted: false,
    get exhausted() { return this.locallyExhausted || budget.exhausted; },
  };
}

export function consumeValueEvaluationWork(session: ValueEvaluationSession, amount = 1): boolean {
  if (session.exhausted) return false;
  session.work += amount;
  session.budget.work += amount;
  if (session.work > 100_000) session.locallyExhausted = true;
  if (session.budget.work > 1_000_000) session.budget.exhausted = true;
  return !session.exhausted;
}
