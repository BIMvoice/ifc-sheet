/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedbackUrl, FEEDBACK_URL_LIMIT, type FeedbackFacts } from './feedback-url';
import { browserSummary } from './feedback-facts';

/**
 * #148: the report is a pre-filled "new issue" link the user submits with
 * their own GitHub account. The app holds no token and calls no API, so the
 * link IS the feature: its template, labels, title and body are the contract.
 */

const FACTS: FeedbackFacts = {
  environment: ['IfcSheet 0.1.0 (abc123def456)', 'Browser: Chrome 126', 'OS: macOS', 'WebGPU: available'],
  place: ['Screen: sheet A-101', 'View kind: plan', 'Tool: line'],
};
const NONE = { environment: false, place: false } as const;
const params = (url: string): URLSearchParams => new URL(url).searchParams;

describe('buildFeedbackUrl (#148)', () => {
  it('a bug opens the bug template with the bug label and the typed title and description', () => {
    const { url } = buildFeedbackUrl({ kind: 'bug', title: 'Scale bar is wrong', description: 'It says 1:50 on a 1:100 view.', parts: NONE }, FACTS);
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://github.com/BIMvoice/ifcsheet/issues/new');
    assert.equal(params(url).get('template'), 'bug.yml');
    assert.equal(params(url).get('labels'), 'bug');
    assert.equal(params(url).get('title'), 'Scale bar is wrong');
    assert.equal(params(url).get('description'), 'It says 1:50 on a 1:100 view.');
  });

  it('a suggestion maps to enhancement and a question to question', () => {
    assert.equal(params(buildFeedbackUrl({ kind: 'suggestion', title: 't', description: 'd', parts: NONE }, FACTS).url).get('labels'), 'enhancement');
    assert.equal(params(buildFeedbackUrl({ kind: 'suggestion', title: 't', description: 'd', parts: NONE }, FACTS).url).get('template'), 'suggestion.yml');
    const q = params(buildFeedbackUrl({ kind: 'question', title: 't', description: 'why?', parts: NONE }, FACTS).url);
    assert.equal(q.get('labels'), 'question');
    assert.equal(q.get('body'), 'why?');
  });

  it('carries each context part only when its box is ticked', () => {
    const draft = { kind: 'bug', title: 't', description: 'd' } as const;
    const none = buildFeedbackUrl({ ...draft, parts: NONE }, FACTS).url;
    assert.equal(params(none).get('context'), null);
    assert.doesNotMatch(none, /Chrome/);

    const env = params(buildFeedbackUrl({ ...draft, parts: { environment: true, place: false } }, FACTS).url).get('context') ?? '';
    assert.match(env, /IfcSheet 0\.1\.0 \(abc123def456\)/);
    assert.match(env, /Chrome 126/);
    assert.doesNotMatch(env, /A-101/);

    const place = params(buildFeedbackUrl({ ...draft, parts: { environment: false, place: true } }, FACTS).url).get('context') ?? '';
    assert.match(place, /A-101/);
    assert.match(place, /Tool: line/);
    assert.doesNotMatch(place, /Chrome/);
  });

  it('a question has its context in the body, after the typed text', () => {
    const body = params(buildFeedbackUrl({ kind: 'question', title: 't', description: 'why?', parts: { environment: true, place: false } }, FACTS).url).get('body') ?? '';
    assert.match(body, /^why\?\n\n/);
    assert.match(body, /Chrome 126/);
  });

  it('keeps the link under the limit by cutting the description, and says so', () => {
    const long = 'x'.repeat(20_000);
    const built = buildFeedbackUrl({ kind: 'bug', title: 't', description: long, parts: { environment: true, place: true } }, FACTS);
    assert.ok(built.url.length <= FEEDBACK_URL_LIMIT, `link is ${built.url.length}`);
    assert.equal(built.truncated, true);
    const description = params(built.url).get('description') ?? '';
    assert.match(description, /truncated/i);
    assert.match(params(built.url).get('context') ?? '', /Chrome 126/, 'the context survives the cut');
    assert.ok(description.length > 1000, 'most of the room goes to the typed text');
  });

  it('cuts multi-byte text by what it costs encoded, never through a character', () => {
    const emoji = '😀'.repeat(5_000);
    const built = buildFeedbackUrl({ kind: 'bug', title: 't', description: emoji, parts: NONE }, FACTS);
    assert.ok(built.url.length <= FEEDBACK_URL_LIMIT);
    assert.doesNotThrow(() => decodeURIComponent(built.url.split('?')[1] ?? ''));
  });

  it('does not truncate a short report', () => {
    assert.equal(buildFeedbackUrl({ kind: 'bug', title: 't', description: 'short', parts: NONE }, FACTS).truncated, false);
  });

  it('writes a space as %20 and a plus as %2B, never a bare +, in every field of the link', () => {
    const draft = { kind: 'bug', title: 'a b+c', description: 'one two+three 1+1', parts: { environment: true, place: false } } as const;
    const { url } = buildFeedbackUrl(draft, FACTS);
    const query = url.split('?')[1] ?? '';
    assert.equal(query.includes('+'), false, `a bare + in ${query}`);
    assert.ok(query.includes('title=a%20b%2Bc'), query);
    assert.ok(query.includes('description=one%20two%2Bthree%201%2B1'), query);
    assert.ok(query.includes('context=-%20IfcSheet%200.1.0'), 'the context lines too');
    // And it reads back as typed.
    assert.equal(params(url).get('title'), 'a b+c');
    assert.equal(params(url).get('description'), 'one two+three 1+1');
    // A question rides `body`, which is encoded the same way.
    assert.equal(buildFeedbackUrl({ ...draft, kind: 'question' }, FACTS).url.split('?')[1]?.includes('+'), false);
  });

  it('caps a long title', () => {
    const t = params(buildFeedbackUrl({ kind: 'bug', title: 'y'.repeat(900), description: 'd', parts: NONE }, FACTS).url).get('title') ?? '';
    assert.ok(t.length <= 200);
  });
});

describe('browserSummary', () => {
  it('names the browser, its major version and the OS family, nothing else', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36';
    assert.deepEqual(browserSummary(ua), { browser: 'Chrome 126', os: 'macOS' });
    assert.deepEqual(browserSummary('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'), { browser: 'Firefox 128', os: 'Linux' });
    assert.deepEqual(browserSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.81'), { browser: 'Edge 126', os: 'Windows' });
    assert.deepEqual(browserSummary(''), { browser: 'unknown', os: 'unknown' });
  });
});
