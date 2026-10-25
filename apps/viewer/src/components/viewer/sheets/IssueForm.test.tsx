/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The handover action and its file name pattern in the issue form (#83), in English and in Romanian. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render, type as typeInto } from '@/test/render.js';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { resetProject, useProjectStore } from '@/project/project-store';
import { IssueForm } from './IssueForm';
import { WALL_SKIN } from './set-skin';

beforeEach(() => { resetProject(); registerLocale('ro', ro); });
afterEach(() => { cleanup(); setLocale('en'); resetProject(); });

const field = (root: HTMLElement) => root.querySelector<HTMLInputElement>('#handover-pattern')!;

describe('the handover in the issue form', () => {
  it('offers the action beside the issue formats and shows the default pattern with an example name', () => {
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok([...root.querySelectorAll('button')].some((b) => b.textContent === 'Hand over (ZIP)'));
    assert.equal(field(root).value, '{number} {sheet}');
    assert.ok(root.textContent?.includes('Example: A-101 Ground floor.dxf'));
    assert.equal(useProjectStore.getState().handoverPattern, undefined, 'looking at the default stores nothing');
  });

  it('stores the pattern with the project as it is typed, shows the name it makes, and goes back to the default', () => {
    const root = render(<IssueForm skin={WALL_SKIN} />);
    typeInto(field(root), '{number}_{sheet} rev {revision}');
    assert.equal(useProjectStore.getState().handoverPattern, '{number}_{sheet} rev {revision}');
    assert.equal(useProjectStore.getState().dirty, true);
    assert.ok(root.textContent?.includes('Example: A-101_Ground floor rev B.dxf'), root.textContent ?? '');
    const reset = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Default')!;
    click(reset);
    assert.equal(useProjectStore.getState().handoverPattern, undefined);
    assert.equal(field(root).value, '{number} {sheet}');
  });

  it('is in Romanian too, and keeps the file names ASCII', () => {
    setLocale('ro');
    const root = render(<IssueForm skin={WALL_SKIN} />);
    assert.ok([...root.querySelectorAll('button')].some((b) => b.textContent === 'Predă (ZIP)'));
    assert.ok(root.textContent?.includes('Tiparul denumirii fișierelor'));
    typeInto(field(root), '{sheet}');
    assert.ok(root.textContent?.includes('Exemplu: Ground floor.dxf'));
  });
});
