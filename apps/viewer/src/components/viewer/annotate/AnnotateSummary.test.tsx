/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The summary of a stopped "Annotate the set" run (#869): the added line counts against the views the run was asked to
 * annotate, so it agrees with the stopped line instead of reading "3 of 3" above "stopped after 3 of 12".
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { setLocale } from '@/i18n/registry';
import type { SetSummary } from '@/annotate-set/annotate-set';
import { cleanup, render } from '@/test/render.js';
import { AnnotateSummary } from './AnnotateSummary';

const added = (viewId: string, count: number) => ({ viewId, name: viewId, kind: 'plan' as const, results: [{ command: 'tagall' as const, outcome: 'added' as const, added: count, messages: [], ms: 0 }] });
const skipped = (viewId: string) => ({ viewId, name: viewId, kind: 'elevation' as const, results: [], skipped: { key: 'wall.annotateWait.timedOut' as const, params: { seconds: 90 } } });

beforeEach(() => { act(() => setLocale('en')); });
afterEach(cleanup);

describe('AnnotateSummary of a stopped run (#869)', () => {
  it('counts the added views against the whole set, and names a skipped view', () => {
    const summary: SetSummary = { views: [added('V1', 100), added('V2', 151), skipped('V3')], total: 12, added: 251, cancelled: true };
    const text = render(<AnnotateSummary summary={summary} />).textContent ?? '';
    assert.match(text, /Added 251 on 2 of 12 views\./);
    assert.match(text, /Stopped after 3 of 12 views/);
    assert.doesNotMatch(text, /of 3 views/);
    assert.match(text, /V3/);
    assert.match(text, /90/);
  });
});
