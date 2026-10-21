/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "new issue" link behind the Feedback form (#148). The app holds no
 * GitHub token and calls no GitHub API: it only builds a link the user opens
 * and submits with their own account. So the link is the whole feature, and
 * this module is pure: draft and facts in, link out.
 *
 * Bug and suggestion open the repo's issue forms (`bug.yml`, `suggestion.yml`),
 * which prefill their `description` and `context` fields from the link. A
 * question has no form, so it rides `body`.
 */

export const FEEDBACK_REPO = 'BIMvoice/ifcsheet';

export type FeedbackKind = 'bug' | 'suggestion' | 'question';

/** Which context parts the user ticked. Nothing is attached unless it is `true`. */
export interface FeedbackParts {
  environment: boolean;
  place: boolean;
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  parts: FeedbackParts;
}

/** The context lines available, one list per part. Never file names, model contents or ids. */
export interface FeedbackFacts {
  environment: readonly string[];
  place: readonly string[];
}

export interface BuiltFeedback {
  url: string;
  /** The typed description was cut to keep the link under the limit. */
  truncated: boolean;
  /** The context text that goes with the report (empty when no part is ticked). */
  context: string;
}

/**
 * GitHub answers 414 above roughly 8 KB of URL; this leaves room under it.
 * The whole link is measured, encoding included.
 */
export const FEEDBACK_URL_LIMIT = 7000;
const TITLE_LIMIT = 200;
const TRUNCATION_NOTE = '\n\n[Truncated: the report was longer than a GitHub link allows. Add the rest here.]';

const FORM: Record<FeedbackKind, { template?: string; label: string }> = {
  bug: { template: 'bug.yml', label: 'bug' },
  suggestion: { template: 'suggestion.yml', label: 'enhancement' },
  question: { label: 'question' },
};

/** The context text for the ticked parts: one `- line` per fact. */
export function feedbackContext(parts: FeedbackParts, facts: FeedbackFacts): string {
  const lines = [...(parts.environment ? facts.environment : []), ...(parts.place ? facts.place : [])];
  return lines.map((l) => `- ${l}`).join('\n');
}

function link(draft: FeedbackDraft, description: string, context: string): string {
  const { template, label } = FORM[draft.kind];
  const q = new URLSearchParams();
  if (template) q.set('template', template);
  q.set('title', draft.title.slice(0, TITLE_LIMIT));
  q.set('labels', label);
  if (template) {
    q.set('description', description);
    if (context) q.set('context', context);
  } else {
    q.set('body', context ? `${description}\n\n${context}` : description);
  }
  return `https://github.com/${FEEDBACK_REPO}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
}

/** `text` cut to `n` UTF-16 units, without leaving half a surrogate pair. */
function cut(text: string, n: number): string {
  const end = n > 0 && n < text.length && /[\uD800-\uDBFF]/.test(text[n - 1] ?? '') ? n - 1 : n;
  return text.slice(0, end);
}

export function buildFeedbackUrl(draft: FeedbackDraft, facts: FeedbackFacts): BuiltFeedback {
  const context = feedbackContext(draft.parts, facts);
  const whole = link(draft, draft.description, context);
  if (whole.length <= FEEDBACK_URL_LIMIT) return { url: whole, truncated: false, context };
  // The context is small and fixed; the typed text gives way. Longest prefix that fits, found by bisection.
  let lo = 0;
  let hi = draft.description.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (link(draft, cut(draft.description, mid) + TRUNCATION_NOTE, context).length <= FEEDBACK_URL_LIMIT) lo = mid;
    else hi = mid - 1;
  }
  return { url: link(draft, cut(draft.description, lo) + TRUNCATION_NOTE, context), truncated: true, context };
}
