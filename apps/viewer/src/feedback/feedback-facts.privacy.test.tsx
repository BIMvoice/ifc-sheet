/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useDraftingSession } from '@/drafting/session';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { stepInto, useWallNav } from '@/components/viewer/wall/wall-nav';
import { collectFeedbackFacts } from './feedback-facts';
import { buildFeedbackUrl } from './feedback-url';

/**
 * #148, privacy: the form attaches only the build, the browser and where the
 * user is. Nothing the user's file supplies (the project's, a sheet's, a
 * view's or a level's name, the title block, drawn text) may reach the facts
 * or the link. The sentinels below are planted in every such place, with all
 * context parts ticked; and the lines are held to an allow-list, so a new
 * line that carries some other file text fails here too.
 */

const SECRET = {
  project: 'SECRET-PROJECT-Ostrich',
  sheet: 'SECRET-SHEET-Walrus',
  view: 'SECRET-VIEW-Heron',
  level: 'SECRET-LEVEL-Lynx',
  client: 'SECRET-CLIENT-Newt',
  text: 'SECRET-TEXT-Ibis',
} as const;

let sheetId = '';

beforeEach(() => {
  resetProject();
  const levels = [{ name: SECRET.level, elevation: 0, storeyGlobalIds: ['L0'] }];
  const views = defaultViews(levels).map((v) => ({ ...v, name: SECRET.view }));
  useProjectStore.setState({
    name: SECRET.project, levels, views,
    titleBlock: { client: SECRET.client },
    drafts: [{ id: 'd1', viewId: views[0]?.id ?? '', layerId: '0', shape: { type: 'text', p: { x: 0, y: 0 }, text: SECRET.text, height: 3.5, rotation: 0 }, params: {} }],
  });
  sheetId = addProjectSheet(SECRET.sheet, 'plans');
  stepInto(sheetId);
  useWallNav.setState({ focus: views[0]?.id ?? null });
  useDraftingSession.setState({ commandId: 'line' });
});
afterEach(() => {
  useDraftingSession.setState({ commandId: null });
  useWallNav.setState({ stepped: null, focus: null });
  resetProject();
});

describe('what the Feedback form attaches (#148)', () => {
  it('carries none of the project, sheet, view or level names, title block or drawn text, in the facts or the link', () => {
    const facts = collectFeedbackFacts();
    assert.ok(facts.place.some((l) => l.startsWith('Sheet: ')), 'the place is the stepped-into sheet');
    assert.ok(facts.place.some((l) => l === 'Running tool: line'), 'and the running tool');
    const built = buildFeedbackUrl({ kind: 'bug', title: 't', description: 'd', parts: { environment: true, place: true } }, facts);
    const everything = [JSON.stringify(facts), built.url, decodeURIComponent(built.url), built.context].join('\n');
    for (const [what, secret] of Object.entries(SECRET)) {
      assert.equal(everything.includes(secret), false, `the ${what} text "${secret}" reached the feedback`);
    }
    // The fragments too: a name cut or recased is still the name.
    assert.doesNotMatch(everything, /ostrich|walrus|heron|lynx|newt|ibis/i);
  });

  it('holds every line to what is allowed: build, browser, OS, WebGPU, the sheet number, the view kind, the tool', () => {
    const { environment, place } = collectFeedbackFacts();
    for (const line of environment) assert.match(line, /^(IfcSheet [^\s]+ \([^\s)]+\)|Browser: [\w .]+|OS: \w+|WebGPU: (available|unavailable))$/, `environment line: ${line}`);
    const number = useProjectStore.getState().sheets.find((s) => s.id === sheetId)?.number ?? '';
    assert.ok(number);
    assert.deepEqual(place, [`Sheet: ${number}`, 'View kind: plan', 'Running tool: line']);
  });
});
