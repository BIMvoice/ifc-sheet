/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The intro shows the set it says is drawn: the first sheets as papers, each a way into that sheet, and a line for the
 * ones it does not show. What the model lacks waits behind one line instead of standing above the way in.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, click, press, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import { WallIntro } from './WallIntro';

const extent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } };
const sheet = (n: number): ProjectSheet => ({ id: `s${n}`, number: `A-10${n}`, name: `Plan ${n}`, createdAt: n, paper: 'A3', orientation: 'landscape', titleBlock: {}, viewports: [] } as ProjectSheet);
const thumbs = (ui: HTMLElement): HTMLButtonElement[] => [...ui.querySelectorAll<HTMLButtonElement>('[data-testid="intro-sheets"] button')];

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ models: new Map() });
});
afterEach(() => cleanup());

describe('the sheets on the intro', () => {
  it('draws the first six as papers and counts the rest', () => {
    useProjectStore.setState({ sheets: [1, 2, 3, 4, 5, 6, 7, 8].map(sheet) });
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} onOpenSheet={() => undefined} />);
    assert.equal(thumbs(ui).length, 6);
    assert.equal(thumbs(ui).filter((b) => b.querySelector('svg')).length, 6, 'each is the sheet as drawn, not a label');
    assert.match(ui.querySelector('[data-testid="intro-sheets"]')?.textContent ?? '', /A-101 Plan 1.*and 2 more sheets/s);
  });

  it('opens the sheet that was picked, and Enter on it does not open the whole set', () => {
    useProjectStore.setState({ sheets: [1, 2, 3].map(sheet) });
    const opened: string[] = [];
    let hung = 0;
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => { hung++; }} onOpenSheet={(id) => opened.push(id)} />);
    assert.doesNotMatch(ui.textContent ?? '', /more sheet/, 'three sheets leave none to count');
    click(thumbs(ui)[1]);
    assert.deepEqual(opened, ['s2']);
    press(thumbs(ui)[1], 'Enter');
    assert.equal(hung, 0);
  });

  it('shows no sheets where nothing can open one', () => {
    useProjectStore.setState({ sheets: [1, 2].map(sheet) });
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    assert.equal(thumbs(ui).length, 0);
  });
});

describe('what the model lacks, on the intro', () => {
  it('waits behind one line that says how many findings there are', async () => {
    const ifcDataStore = await parseStep(new Uint8Array(readFileSync(new URL('../../../../public/samples/building-architecture.ifc', import.meta.url))));
    useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'building-architecture.ifc' }]]) } as never);
    const ui = render(<WallIntro modelName="building-architecture.ifc" extent={extent} onHang={() => undefined} />);
    const fold = ui.querySelector<HTMLDetailsElement>('[data-testid="readiness-fold"]');
    assert.ok(fold, 'the findings are folded');
    assert.equal(fold.open, false, 'closed until the person opens it');
    const findings = fold.querySelectorAll('li').length;
    assert.ok(findings >= 2, 'the sample model has findings');
    assert.equal(fold.querySelector('summary')?.textContent, `${findings} things to check in the model`);
  });

  it('says nothing when the model lacks nothing to report', () => {
    const ui = render(<WallIntro modelName="House.ifc" extent={extent} onHang={() => undefined} />);
    assert.equal(ui.querySelector('[data-testid="readiness-fold"]'), null);
  });
});
