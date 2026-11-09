/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168 (audit finding 6): outside AutoCAD mode Enter and Space no longer start the last
 * tool again. Repeating is the "Repeat last tool" command, which has no default key.
 */

import '@/test/setup-dom.js';
import { act, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, clickDrawing, endCommand, pressEscape, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { rebindAction, resetAllBindings } from '@/lib/commands/key-bindings';
import { CommandLine } from './CommandLine.js';
import { useDraftingKeys } from './useDraftingKeys.js';
import { submitTypedLine } from './typed-line.js';

function Drafting() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText, submit: () => submitTypedLine('', null) });
  return <CommandLine ref={inputRef} value={text} onChange={setText} onSubmit={() => { submitTypedLine(text, null); setText(''); }} onEscape={() => { setText(''); pressEscape(); }} />;
}

/** A Line with two points, ended with Done: the way a person finishes a tool without Esc or Enter. */
function drawLineThenDone(): void {
  act(() => {
    startDraftCommand('line');
    clickDrawing({ x: 0, y: 0 }, 0.05, false);
    clickDrawing({ x: 5, y: 0 }, 0.05, false);
    endCommand();
  });
}

const commandId = () => useDraftingSession.getState().commandId;
const draftCount = () => useProjectStore.getState().drafts.length;

beforeEach(() => {
  setPlatform('Win32');
  cancelCommand();
  resetProject();
  clearDraftHistory();
  resetAllBindings();
  setAutocadMode(false);
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});
afterEach(() => {
  cleanup();
  cancelCommand();
  resetAllBindings();
  setAutocadMode(false);
});

describe('Enter and Space with no command running (#168)', () => {
  it('start nothing and draw nothing after a Line was finished with Done', () => {
    render(<Drafting />);
    drawLineThenDone();
    assert.equal(commandId(), null);
    const drawn = draftCount();
    assert.equal(drawn, 1, 'the Line was drawn');
    for (const key of [' ', 'Enter']) {
      press(document.body, key);
      assert.equal(commandId(), null, `${key === ' ' ? 'Space' : key} did not start a tool`);
    }
    assert.equal(draftCount(), drawn);
  });

  it('still repeat the last tool in AutoCAD mode', () => {
    setAutocadMode(true);
    render(<Drafting />);
    drawLineThenDone();
    assert.equal(commandId(), null);
    press(document.body, ' ');
    assert.equal(commandId(), 'line');
    cancelCommand();
    press(document.body, 'Enter');
    assert.equal(commandId(), 'line');
  });

  it('keep Enter for a running command: it ends the Line', () => {
    render(<Drafting />);
    act(() => {
      startDraftCommand('line');
      clickDrawing({ x: 0, y: 0 }, 0.05, false);
      clickDrawing({ x: 5, y: 0 }, 0.05, false);
    });
    assert.equal(commandId(), 'line');
    press(document.body, 'Enter');
    assert.equal(commandId(), null);
    assert.equal(draftCount(), 1);
  });
});

describe('Repeat last tool', () => {
  it('has no default key, so nothing repeats until the person binds one', () => {
    render(<Drafting />);
    drawLineThenDone();
    press(document.body, 'r');
    assert.equal(commandId(), null);
  });

  it('starts the last tool from the key the person bound to it, and only when nothing runs', () => {
    rebindAction('drafting.repeat', { key: 'f6' });
    render(<Drafting />);
    press(document.body, 'F6');
    assert.equal(commandId(), null, 'no tool has run yet');
    drawLineThenDone();
    press(document.body, 'F6');
    assert.equal(commandId(), 'line');
  });
});
