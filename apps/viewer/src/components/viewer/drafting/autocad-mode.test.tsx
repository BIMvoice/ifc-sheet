/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AutoCAD mode (#168), through the command line as it mounts: its key
 * handler, its input and the Wall's handlers. Typed aliases run their
 * registry action, Enter or Space repeats, Esc cancels, F8 toggles ortho, and
 * typed coordinates draw exact geometry. With the mode off, nothing changes.
 */

import '@/test/setup-dom.js';
import { act, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, pressEscape, useDraftingSession } from '@/drafting/session';
import type { EntityShape, Pt } from '@/drafting/types';
import { AUTOCAD_ALIASES } from '@/lib/commands/autocad-aliases';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { rebindAction, resetAllBindings } from '@/lib/commands/key-bindings';
import { WALL_KEY_COMMANDS, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { CommandLine } from './CommandLine.js';
import { useDraftingKeys } from './useDraftingKeys.js';
import { submitTypedLine } from './typed-line.js';
import { useWallKeys, type WallHandlers } from '../wall/wall-key-bus.js';

const shapes = (): EntityShape[] => useProjectStore.getState().drafts.map((d) => d.shape);
const history = (): string[] => useDraftingSession.getState().history.map((l) => l.key);
const lastLine = (): string | undefined => history().at(-1);

function counting(offer: (id: WallKeyId) => boolean = () => true): { handlers: WallHandlers; calls: WallKeyId[] } {
  const calls: WallKeyId[] = [];
  const handlers = Object.fromEntries(WALL_KEY_COMMANDS.map(({ id }) => [id, offer(id) ? () => { calls.push(id); } : null])) as unknown as WallHandlers;
  return { handlers, calls };
}

/** The drafting view's command line, wired as `DraftingView` wires it. */
function Drafting({ handlers, cursor = null }: { handlers: WallHandlers; cursor?: Pt | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText, submit: () => submitTypedLine('', cursor) });
  useWallKeys(handlers);
  return (
    <CommandLine
      ref={inputRef}
      value={text}
      onChange={setText}
      onSubmit={() => { submitTypedLine(text, cursor); setText(''); }}
      onEscape={() => { setText(''); pressEscape(); }}
    />
  );
}

function mount(handlers = counting().handlers, cursor: Pt | null = null): HTMLInputElement {
  const ui = render(<Drafting handlers={handlers} cursor={cursor} />);
  return ui.querySelector('input[aria-label="Command line"]') as HTMLInputElement;
}

/** Type a line on the page (CAD style, with no click into the line first) and press Enter. */
function enter(line: HTMLInputElement, text: string): void {
  for (const ch of text) press(document.body, ch);
  press(line, 'Enter');
}

beforeEach(() => {
  setPlatform('Win32');
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  resetAllBindings();
  localStorage.clear();
  setPlatform(null);
});

describe('AutoCAD mode on: aliases', () => {
  beforeEach(() => setAutocadMode(true));

  const DRAFTING_NAMES: readonly [string, string][] = [
    ['L', 'line'], ['PL', 'polyline'], ['DIM', 'dimaligned'], ['DLI', 'dimlinear'], ['CO', 'copy'], ['CP', 'copy'],
    ['M', 'move'], ['E', 'erase'], ['O', 'offset'], ['TR', 'trim'], ['EX', 'extend'], ['C', 'circle'], ['RO', 'rotate'],
  ];
  for (const [alias, command] of DRAFTING_NAMES) {
    it(`${alias} starts ${command}`, () => {
      const line = mount();
      enter(line, alias.toLowerCase());
      assert.equal(useDraftingSession.getState().commandId, command);
    });
  }

  const WALL_NAMES: readonly [string, WallKeyId][] = [
    ['Z', 'wall.fit'], ['ZOOM', 'wall.fit'], ['PLOT', 'wall.print'], ['PRINT', 'wall.print'], ['PREVIEW', 'wall.printPreview'],
    ['DXFOUT', 'wall.exportDxf'], ['MV', 'wall.addDrawing'], ['MVIEW', 'wall.addDrawing'], ['PAGESETUP', 'wall.paper'],
  ];
  it('pins every Wall alias of the table', () => {
    assert.deepEqual(AUTOCAD_ALIASES.filter((a) => a.action.startsWith('wall.')).map((a) => [a.alias, a.action]), WALL_NAMES);
  });
  for (const [alias, action] of WALL_NAMES) {
    it(`${alias} runs the registry action ${action}, once`, () => {
      const { handlers, calls } = counting();
      const line = mount(handlers);
      enter(line, alias.toLowerCase());
      assert.deepEqual(calls, [action]);
      assert.equal(useDraftingSession.getState().commandId, null);
    });
  }

  it('U undoes the last drawing step and REDO brings it back', () => {
    const line = mount();
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@3,4');
    press(line, 'Enter');
    assert.equal(shapes().length, 1);
    enter(line, 'u');
    assert.equal(shapes().length, 0);
    enter(line, 'redo');
    assert.equal(shapes().length, 1);
  });

  it('while a command runs, a typed alias is input for it, not the action (U is not undo mid-LINE)', () => {
    const line = mount();
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@3,4');
    enter(line, 'u');
    assert.equal(shapes().length, 1);
    assert.equal(lastLine(), 'drafting.msg.invalidInput');
    assert.equal(useDraftingSession.getState().commandId, 'line');
  });

  it('ORTHO toggles ortho and says so in the command line', () => {
    const line = mount();
    enter(line, 'ortho');
    assert.equal(useDraftingSession.getState().ortho, true);
    assert.equal(lastLine(), 'wall.keys.autocad.orthoOn');
  });

  it('an action not on offer here says so, and runs nothing', () => {
    const { handlers, calls } = counting((id) => id !== 'wall.fit');
    const line = mount(handlers);
    enter(line, 'z');
    assert.deepEqual(calls, []);
    assert.equal(lastLine(), 'wall.keys.autocad.unavailable');
  });

  it('a bare key the person bound to a Wall action types into the command line instead', () => {
    rebindAction('wall.back', { key: 'g' });
    const { handlers, calls } = counting();
    const line = mount(handlers);
    press(document.body, 'g');
    assert.deepEqual(calls, []);
    assert.equal(line.value, 'g');
  });

  it('a bare key the person bound to ortho types into the command line instead (O is OFFSET)', () => {
    rebindAction('drafting.ortho', { key: 'o' });
    const line = mount();
    enter(line, 'o');
    assert.equal(useDraftingSession.getState().ortho, false);
    assert.equal(useDraftingSession.getState().commandId, 'offset');
  });
});

describe('AutoCAD mode on: Enter, Space, Esc, F8', () => {
  beforeEach(() => setAutocadMode(true));

  it('Enter on an empty line repeats the last drawing command', () => {
    const line = mount();
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@1,0');
    press(line, 'Enter'); // ends LINE
    assert.equal(useDraftingSession.getState().commandId, null);
    press(line, 'Enter');
    assert.equal(useDraftingSession.getState().commandId, 'line');
  });

  it('Enter and Space on an empty line repeat the last alias, until a drafting command starts', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    enter(line, 'z');
    press(line, 'Enter');
    press(line, ' ');
    assert.deepEqual(calls, ['wall.fit', 'wall.fit', 'wall.fit']);
    enter(line, 'l');
    press(line, 'Escape');
    press(line, 'Enter');
    assert.equal(useDraftingSession.getState().commandId, 'line', 'LINE started after Z, so Enter repeats LINE');
    assert.deepEqual(calls, ['wall.fit', 'wall.fit', 'wall.fit']);
  });

  it('Enter with focus away from the line repeats too', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    enter(line, 'z');
    act(() => line.blur());
    press(document.body, 'Enter');
    assert.deepEqual(calls, ['wall.fit', 'wall.fit']);
  });

  it('Esc cancels the running command, from the line and from the page', () => {
    const line = mount();
    enter(line, 'l');
    press(line, 'Escape');
    assert.equal(useDraftingSession.getState().commandId, null);
    enter(line, 'pl');
    act(() => line.blur());
    press(document.body, 'Escape');
    assert.equal(useDraftingSession.getState().commandId, null);
  });

  it('F8 toggles ortho and announces it; F3 snap likewise', () => {
    mount();
    press(document.body, 'F8');
    assert.equal(useDraftingSession.getState().ortho, true);
    assert.equal(lastLine(), 'wall.keys.autocad.orthoOn');
    press(document.body, 'F8');
    assert.equal(useDraftingSession.getState().ortho, false);
    assert.equal(lastLine(), 'wall.keys.autocad.orthoOff');
    press(document.body, 'F3');
    assert.equal(useDraftingSession.getState().snap, false);
    assert.equal(lastLine(), 'wall.keys.autocad.snapOff');
  });
});

describe('AutoCAD mode on: typed coordinates and distances', () => {
  beforeEach(() => setAutocadMode(true));

  it('absolute, relative, polar and a plain distance draw the exact line', () => {
    // A cursor straight below the last point: the distance runs toward it.
    const line = mount(counting().handlers, { x: 3, y: 100 });
    enter(line, 'l');
    enter(line, '1,2'); // absolute; a view's y runs down on screen, up in the user's frame
    enter(line, '@3,0'); // relative
    enter(line, '@2<90'); // polar
    enter(line, '5'); // a distance toward the cursor
    press(line, 'Enter');
    const got = shapes() as { type: 'line'; a: Pt; b: Pt }[];
    assert.equal(got.length, 3);
    const close = (p: Pt, x: number, y: number) => assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9, `${JSON.stringify(p)} vs ${x},${y}`);
    close(got[0].a, 1, -2);
    close(got[0].b, 4, -2);
    close(got[1].b, 4, -4);
    // From (4,-4) toward the cursor (3,100), 5 long.
    const dx = 3 - 4;
    const dy = 100 + 4;
    const l = Math.hypot(dx, dy);
    close(got[2].b, 4 + (dx / l) * 5, -4 + (dy / l) * 5);
  });

  it('refuses bad input with a message, and the command keeps waiting', () => {
    const line = mount();
    enter(line, 'l');
    for (const bad of ['1,2,3', '@1<2<3', 'abc,1']) {
      enter(line, bad);
      assert.equal(lastLine(), 'drafting.msg.invalidInput', bad);
    }
    assert.equal(useDraftingSession.getState().commandId, 'line');
    assert.equal(shapes().length, 0);
  });
});

describe('AutoCAD mode on: Wall shortcuts after a typed alias', () => {
  beforeEach(() => setAutocadMode(true));

  /** The keys that stay the Wall's: a stepped sheet, a tool, print. */
  const KEYS: readonly [string, KeyboardEventInit, WallKeyId][] = [
    ['PageDown', {}, 'wall.nextSheet'],
    ['1', { altKey: true, code: 'Digit1' }, 'wall.tool.dimaligned'],
    ['p', { ctrlKey: true, code: 'KeyP' }, 'wall.print'],
  ];

  for (const [key, init, id] of KEYS) {
    it(`${key}${init.altKey ? ' (Alt)' : init.ctrlKey ? ' (Ctrl)' : ''} still runs ${id} from the command line once Z has run and the line is empty`, () => {
      const { handlers, calls } = counting();
      const line = mount(handlers);
      enter(line, 'z');
      act(() => line.focus());
      assert.equal(document.activeElement, line);
      calls.length = 0;
      press(line, key, init);
      assert.deepEqual(calls, [id]);
    });
  }

  it('a line that holds text keeps its keys: PageDown there is the field\'s', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    press(document.body, 'z');
    act(() => line.focus());
    assert.equal(line.value, 'z');
    press(line, 'PageDown');
    assert.deepEqual(calls, []);
  });

  it('another text field keeps its keys', () => {
    const { handlers, calls } = counting();
    mount(handlers);
    const other = document.createElement('input');
    document.body.appendChild(other);
    press(other, 'PageDown');
    assert.deepEqual(calls, []);
    other.remove();
  });
});

describe('AutoCAD mode off: the command line keeps the keys, as on main', () => {
  it('PageDown in the empty command line is not the Wall\'s', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    press(line, 'PageDown');
    assert.deepEqual(calls, []);
  });
});

describe('AutoCAD mode on: a focused control keeps Enter and Space', () => {
  beforeEach(() => setAutocadMode(true));

  const CONTROLS: readonly [string, () => HTMLElement][] = [
    ['button', () => document.createElement('button')],
    ['link', () => Object.assign(document.createElement('a'), { href: '#x' })],
    ['role=button', () => { const d = document.createElement('div'); d.setAttribute('role', 'button'); return d; }],
    ['select', () => document.createElement('select')],
    ['checkbox', () => Object.assign(document.createElement('input'), { type: 'checkbox' })],
    ['span inside a button', () => { const b = document.createElement('button'); b.appendChild(document.createElement('span')); return b.firstChild as HTMLElement; }],
  ];

  for (const [name, make] of CONTROLS) {
    for (const key of ['Enter', ' ']) {
      it(`${key === ' ' ? 'Space' : key} on a ${name} does not repeat the last alias, and is not cancelled`, () => {
        const { handlers, calls } = counting();
        const line = mount(handlers);
        enter(line, 'z');
        const control = make();
        const host = control.closest('button') ?? control;
        document.body.appendChild(host);
        const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        act(() => { control.dispatchEvent(ev); });
        assert.deepEqual(calls, ['wall.fit']);
        assert.equal(ev.defaultPrevented, false);
        host.remove();
      });
    }
  }

  it('Enter on the page body still repeats', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    enter(line, 'z');
    press(document.body, 'Enter');
    assert.deepEqual(calls, ['wall.fit', 'wall.fit']);
  });
});

describe('AutoCAD mode off: Enter on a focused button confirms, as on main', () => {
  it('repeats the last drawing command', () => {
    const line = mount();
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@1,0');
    press(line, 'Enter'); // ends LINE
    const button = document.createElement('button');
    document.body.appendChild(button);
    press(button, 'Enter');
    assert.equal(useDraftingSession.getState().commandId, 'line');
    button.remove();
  });
});

describe('AutoCAD mode on: a selection prompt takes the line', () => {
  beforeEach(() => setAutocadMode(true));

  it('U typed at "Select objects" does not undo', () => {
    const line = mount();
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@3,4');
    press(line, 'Enter');
    assert.equal(shapes().length, 1);
    enter(line, 'm');
    assert.equal(useDraftingSession.getState().selecting, true);
    enter(line, 'u');
    assert.equal(shapes().length, 1, 'U was typed at a selection prompt, so it is not UNDO');
  });
});

describe('aliases never fire from other text fields', () => {
  beforeEach(() => setAutocadMode(true));

  it('typing Z and Enter in another field runs nothing and types nothing into the command line', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    press(other, 'z');
    press(other, 'Enter');
    assert.deepEqual(calls, []);
    assert.equal(line.value, '');
    other.remove();
  });

  it('AltGr (Ctrl+Alt) and Option glyphs are text: they never type into the line or run an action', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    press(document.body, 'z', { ctrlKey: true, altKey: true, code: 'KeyZ' });
    press(document.body, 'Ω', { altKey: true, code: 'KeyZ' });
    assert.equal(line.value, '');
    assert.deepEqual(calls, []);
    assert.equal(useDraftingSession.getState().ortho, false);
  });
});

describe('AutoCAD mode off (the default): today\'s behaviour', () => {
  it('Z and PLOT are unknown commands and run nothing', () => {
    const { handlers, calls } = counting();
    const line = mount(handlers);
    enter(line, 'z');
    assert.equal(lastLine(), 'drafting.msg.unknownCommand');
    enter(line, 'plot');
    assert.equal(lastLine(), 'drafting.msg.unknownCommand');
    assert.deepEqual(calls, []);
  });

  it('a bare key the person bound to a Wall action runs it at once', () => {
    rebindAction('wall.back', { key: 'g' });
    const { handlers, calls } = counting();
    const line = mount(handlers);
    press(document.body, 'g');
    assert.deepEqual(calls, ['wall.back']);
    assert.equal(line.value, '');
  });

  it('a bare key the person bound to ortho toggles it', () => {
    rebindAction('drafting.ortho', { key: 'o' });
    mount();
    press(document.body, 'o');
    assert.equal(useDraftingSession.getState().ortho, true);
  });

  it('F8 toggles ortho silently, command names, Enter repeat and typed coordinates work as they did', () => {
    const line = mount();
    press(document.body, 'F8');
    assert.equal(useDraftingSession.getState().ortho, true);
    assert.deepEqual(history(), []);
    press(document.body, 'F8');
    enter(line, 'l');
    enter(line, '0,0');
    enter(line, '@3,4');
    press(line, 'Enter');
    assert.deepEqual(shapes(), [{ type: 'line', a: { x: 0, y: 0 }, b: { x: 3, y: -4 } }]);
    press(line, 'Enter');
    assert.equal(useDraftingSession.getState().commandId, 'line');
  });
});
