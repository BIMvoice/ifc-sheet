/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168 (audit finding 2, first slice): outside AutoCAD mode the tool texts name the visible way out (the Done button, the Hide a line
 * toggle, the tag card's field choice), never Enter, Esc or a typed word as the only instruction. With AutoCAD mode on the old texts stay.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cancelCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import type { ProjectView } from '@/project/types';
import { InfoCard } from '../wall/InfoCard';
import { DraftingView } from './DraftingView.js';
import { ElementGraphicsBar } from './ElementGraphicsBar';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;
const ONLY_KEY = /\b(Enter|Esc|Escape)\b(?! work)|type MARK|\(Enter|; Enter/;

function promptOf(command: string): string {
  render(<DraftingView view={plan} />);
  act(() => startDraftCommand(command));
  const text = document.querySelector('[data-tool-prompt] output')?.textContent ?? '';
  assert.ok(text.length > 0, `${command} says its next step`);
  return text;
}

beforeEach(() => {
  setLocale('en');
  cancelCommand();
  resetProject();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
  setLocale('en');
});

describe('tool texts with AutoCAD mode off (#168)', () => {
  for (const command of ['level', 'tag', 'label', 'dimaligned']) {
    it(`${command}: the prompt does not name Enter, Esc or a typed word, and the Done button is beside it`, () => {
      const text = promptOf(command);
      assert.doesNotMatch(text, ONLY_KEY, text);
      const done = [...document.querySelectorAll('[data-tool-prompt] button')].find((b) => b.textContent === 'Done');
      assert.ok(done, 'Done is on the strip');
    });
  }

  it('the level mark and the label name Done; the tag points at the tag card', () => {
    assert.match(promptOf('level'), /Done/);
    cleanup(); cancelCommand();
    assert.match(promptOf('tag'), /The tag shows/);
  });

  for (const tool of ['polyline', 'dimaligned', 'level']) {
    it(`the ${tool} card names Done, with Esc and Enter only as shortcuts`, () => {
      const ui = render(<InfoCard tool={tool} onDone={() => {}} />);
      const text = ui.textContent ?? '';
      assert.match(text, /Done ends the tool|Done stops it/);
      assert.doesNotMatch(text, /Done, Esc or Enter|Esc to stop/);
    });
  }

  it('Hide a line says to press the toggle again, not Escape', () => {
    const ui = render(<ElementGraphicsBar viewId="p" graphics={undefined} extraPatterns={[]} showHidden={false} onShowHidden={() => {}} pickingLine onPickLine={() => {}} />);
    const text = ui.querySelector('output')?.textContent ?? '';
    assert.equal(text, 'Click a line to hide it, or press Hide a line again to stop.');
  });

  it('Romanian carries the same way out', () => {
    registerLocale('ro', ro);
    setLocale('ro');
    assert.match(promptOf('level'), /Gata/);
  });
});

describe('tool texts with AutoCAD mode on (#168)', () => {
  beforeEach(() => setAutocadMode(true));

  it('the cards keep the old texts', () => {
    assert.match(render(<InfoCard tool="polyline" onDone={() => {}} />).textContent ?? '', /Done, Esc or Enter ends the tool/);
    cleanup();
    assert.match(render(<InfoCard tool="dimaligned" onDone={() => {}} />).textContent ?? '', /Esc to stop/);
  });

  it('the command line keeps the old prompt', () => {
    render(<DraftingView view={plan} />);
    act(() => startDraftCommand('level'));
    assert.match(document.querySelector('textarea[aria-label="Command line"]')?.closest('div')?.parentElement?.textContent ?? document.body.textContent ?? '', /Enter to finish/);
  });

  it('the Hide a line hint keeps Escape', () => {
    const ui = render(<ElementGraphicsBar viewId="p" graphics={undefined} extraPatterns={[]} showHidden={false} onShowHidden={() => {}} pickingLine onPickLine={() => {}} />);
    assert.match(ui.querySelector('output')?.textContent ?? '', /Press Escape to stop/);
  });
});
