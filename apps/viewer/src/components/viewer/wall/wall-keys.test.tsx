/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import type { KeyChord } from '@/lib/commands/chord';
import { ariaKeyShortcuts, shortcutLabel } from '@/lib/commands/shortcut-label';
import { rebindAction, resetAllBindings } from '@/lib/commands/key-bindings';
import { DRAFTING_KEY_COMMANDS } from '@/lib/commands/drafting-key-commands';
import { attachDraftingView, cancelCommand, clickDrawing, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { resolveEnglish as t } from '@/i18n/registry';
import { WALL_KEY_COMMANDS, wallToolKey, type WallKeyId } from '@/lib/commands/wall-key-commands';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from '@/drafting/draft-store';
import { undoLatest } from '@/project/unified-undo';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { useDraftingKeys } from '../drafting/useDraftingKeys.js';
import { SteppedSheet } from './SteppedSheet.js';
import { ToolRail } from './ToolRail.js';
import { toolHelpKey } from './tool-help.js';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions.js';
import { steppedHandlers } from './stepped-keys.js';
import { buildWallCommands } from '../commandPaletteCommandsWall.js';
import { availableWallCommands, useWallKeys, type WallHandlers } from './wall-key-bus.js';

/**
 * The Wall's keys (#99): every row of the keymap is performed by a handler on
 * its key, is silent where the key belongs to something else (a text field, a
 * panel that keeps its keys, the drafting command line), and every tool on the
 * rail shows the key that starts it.
 */

afterEach(() => {
  cleanup();
  setPlatform(null);
});

/** The keydown a press of `chord` makes. */
function keydown(chord: KeyChord): KeyboardEvent {
  const code = chord.key.startsWith('code:') ? chord.key.slice('code:'.length) : undefined;
  return new window.KeyboardEvent('keydown', { key: code ? 'Dead' : chord.key, code, altKey: chord.alt === true, shiftKey: chord.shift === true, ctrlKey: chord.mod === true, bubbles: true, cancelable: true });
}

function stroke(target: EventTarget, chord: KeyChord): void {
  act(() => { target.dispatchEvent(keydown(chord)); });
}

/** Every row's handler, counting its calls. */
function counting(): { handlers: WallHandlers; calls: WallKeyId[] } {
  const calls: WallKeyId[] = [];
  const handlers = Object.fromEntries(WALL_KEY_COMMANDS.map(({ id }) => [id, () => { calls.push(id); }])) as unknown as WallHandlers;
  return { handlers, calls };
}

function Harness({ handlers }: { handlers: WallHandlers }) {
  useWallKeys(handlers);
  return (
    <div>
      <input aria-label="a field" />
      <textarea aria-label="a note" />
      <div data-owns-keys><button type="button">a panel button</button></div>
      <button type="button">plain</button>
    </div>
  );
}

/** The drafting view as it mounts: its key handler, and the command line it types into. */
function WithCommandLine({ handlers, typed }: { handlers: WallHandlers; typed: string[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setText] = useState('');
  useDraftingKeys({ inputRef, setText: (v) => { typed.push(typeof v === 'function' ? v('') : v); setText(v); }, submit: () => {} });
  useWallKeys(handlers);
  return <input ref={inputRef} aria-label="command line" />;
}

describe('the Wall\'s keys', () => {
  it('performs every row of the keymap on its key', () => {
    const { handlers, calls } = counting();
    render(<Harness handlers={handlers} />);
    for (const row of WALL_KEY_COMMANDS) {
      for (const chord of row.keys) {
        calls.length = 0;
        stroke(document.body, chord);
        assert.deepEqual(calls, [row.id], `${row.id} on ${JSON.stringify(chord)}`);
      }
    }
  });

  it('is silent when the key belongs to a text field or to a panel that keeps its keys', () => {
    const { handlers, calls } = counting();
    const ui = render(<Harness handlers={handlers} />);
    const owners = [
      ui.querySelector('input'),
      ui.querySelector('textarea'),
      ui.querySelector('[data-owns-keys] button'),
    ];
    for (const owner of owners) {
      assert.ok(owner);
      for (const row of WALL_KEY_COMMANDS) {
        for (const chord of row.keys) stroke(owner, chord);
      }
    }
    assert.deepEqual(calls, []);
    // Control: the same keys on a plain button do fire.
    stroke(ui.querySelectorAll('button')[1], WALL_KEY_COMMANDS[0].keys[0]);
    assert.equal(calls.length, 1);
  });

  it('leaves the drafting command line alone: a letter still types, and no Wall key is lost on the way', () => {
    const { handlers, calls } = counting();
    const typed: string[] = [];
    const ui = render(<WithCommandLine handlers={handlers} typed={typed} />);
    const line = ui.querySelector('input');
    assert.ok(line);
    // A tool is running: "L" for LINE reaches the command line and no Wall key fires on it...
    press(document.body, 'l');
    assert.deepEqual(typed, ['l']);
    for (const row of WALL_KEY_COMMANDS) for (const chord of row.keys) stroke(line, chord);
    assert.deepEqual(calls, []);
    // ...and with the command line not focused, the Wall's keys still arrive (the drafting view does not eat them).
    for (const row of WALL_KEY_COMMANDS) for (const chord of row.keys) stroke(document.body, chord);
    assert.equal(calls.length, WALL_KEY_COMMANDS.reduce((n, c) => n + c.keys.length, 0));
    assert.deepEqual(typed, ['l']);
  });

  it('declines a key whose action is not on offer, so the browser keeps it', () => {
    const { handlers, calls } = counting();
    render(<Harness handlers={{ ...handlers, 'wall.print': null }} />);
    const event = new window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(calls, []);
    assert.equal(availableWallCommands().includes('wall.print'), false);
    assert.equal(availableWallCommands().includes('wall.fit'), true);
  });

  it('takes the key it performs, so the browser does not also act on it', () => {
    const { handlers } = counting();
    render(<Harness handlers={handlers} />);
    const event = new window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  });
});

describe('the rail\'s tooltips', () => {
  const rail = () => render(<ToolRail active={null} onTool={() => {}} adding={false} onAdd={() => {}} viewKind="plan" onAll={() => {}} />);

  it('shows, on every tool of the rail, the key the keymap binds to it', () => {
    for (const apple of [false, true]) {
      setPlatform(apple ? 'MacIntel' : 'Win32');
      const ui = rail();
      for (const tool of [...WALL_TOOLS, ...DRAW_TOOLS]) {
        const id = wallToolKey(tool.command);
        assert.ok(id, tool.command);
        const button = [...ui.querySelectorAll('button')].find((b) => b.getAttribute('title') === `${t(toolHelpKey(tool.command))} (${shortcutLabel(id, apple)})`);
        assert.ok(button, `${tool.command} shows ${shortcutLabel(id, apple)}`);
      }
      const add = [...ui.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a drawing'));
      assert.equal(add?.getAttribute('title'), `Add a drawing (${shortcutLabel('wall.addDrawing', apple)})`);
      cleanup();
    }
  });

  it('announces the same key with aria-keyshortcuts, from the same row, on every control that shows one (#119 review)', () => {
    for (const apple of [false, true]) {
      setPlatform(apple ? 'MacIntel' : 'Win32');
      const ui = rail();
      for (const tool of [...WALL_TOOLS, ...DRAW_TOOLS]) {
        const id = wallToolKey(tool.command)!;
        const button = [...ui.querySelectorAll('button')].find((b) => b.getAttribute('title') === `${t(toolHelpKey(tool.command))} (${shortcutLabel(id, apple)})`);
        assert.equal(button?.getAttribute('aria-keyshortcuts'), ariaKeyShortcuts(id, apple), tool.command);
      }
      const add = [...ui.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a drawing'));
      assert.equal(add?.getAttribute('aria-keyshortcuts'), apple ? 'Alt+A' : 'Alt+A');
      // Every control with a key in its tooltip announces it.
      for (const b of ui.querySelectorAll('button[title]')) assert.ok(b.getAttribute('aria-keyshortcuts'), b.getAttribute('title') ?? '');
      cleanup();
    }
    assert.equal(ariaKeyShortcuts('wall.tool.dimaligned', false), 'Alt+1');
    assert.equal(ariaKeyShortcuts('wall.draw.line', false), 'Alt+Shift+1');
    assert.equal(ariaKeyShortcuts('wall.print', false), 'Control+P');
    assert.equal(ariaKeyShortcuts('wall.print', true), 'Meta+P');
    assert.equal(ariaKeyShortcuts('wall.nextSheet', false), 'PageDown');
    assert.equal(ariaKeyShortcuts('drafting.redo', false), 'Control+Shift+Z Control+Y');
  });

  it('shows no key that is not in the keymap: every key in a tooltip belongs to a row', () => {
    const ui = rail();
    // The rail's Ortho lock shows F8, which is the drafting keymap's row (#146).
    const shown = new Set([...WALL_KEY_COMMANDS, ...DRAFTING_KEY_COMMANDS].map((c) => shortcutLabel(c.id)));
    for (const b of ui.querySelectorAll('button[title]')) {
      const keys = /\(([^)]+)\)$/.exec(b.getAttribute('title') ?? '')?.[1];
      assert.ok(keys && shown.has(keys), `${b.getAttribute('title')}`);
    }
  });
});

describe('a sheet stepped into', () => {
  const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  beforeEach(() => {
    resetProject();
    const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
    useProjectStore.setState({ levels, views: defaultViews(levels) });
    startDrawingSet(null, HOUSE);
  });

  it('is driven by the keymap: a tool key starts the tool, the add key opens the chooser, the sheet keys step', () => {
    const sheets = useProjectStore.getState().sheets;
    assert.ok(sheets.length >= 2);
    const stepped: string[] = [];
    const ui = render(<SteppedSheet sheet={sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={(id) => stepped.push(id)} />);
    const pressed = (label: string) => [...ui.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent?.trim() === label)?.getAttribute('aria-pressed');

    assert.equal(pressed('Add a drawing'), 'false');
    stroke(document.body, WALL_KEY_COMMANDS.find((c) => c.id === 'wall.addDrawing')!.keys[0]);
    assert.equal(pressed('Add a drawing'), 'true');

    stroke(document.body, WALL_KEY_COMMANDS.find((c) => c.id === 'wall.nextSheet')!.keys[0]);
    stroke(document.body, WALL_KEY_COMMANDS.find((c) => c.id === 'wall.prevSheet')!.keys[0]);
    assert.deepEqual(stepped, [sheets[2].id, sheets[0].id]);

    // A tool brings its drawing forward: the sheet keys are then not on offer (below).
    stroke(document.body, WALL_KEY_COMMANDS.find((c) => c.id === 'wall.tool.sectionline')!.keys[0]);
    assert.equal(pressed('Section mark'), 'true');
  });

  it('does not leave the sheet on PageUp / PageDown in the middle of a drafting command or with a drawing in front (#119 review)', () => {
    const sheets = useProjectStore.getState().sheets;
    const stepped: string[] = [];
    render(<SteppedSheet sheet={sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={(id) => stepped.push(id)} />);
    const page = (id: 'wall.nextSheet' | 'wall.prevSheet'): KeyboardEvent => {
      const event = keydown(WALL_KEY_COMMANDS.find((c) => c.id === id)!.keys[0]!);
      act(() => { document.body.dispatchEvent(event); });
      return event;
    };
    try {
      // A polyline with two points down and more to come.
      act(() => {
        attachDraftingView(sheets[1].id, 'down', () => []);
        startDraftCommand('polyline');
      });
      act(() => {
        clickDrawing({ x: 1, y: 1 }, 0.05, false);
        clickDrawing({ x: 4, y: 1 }, 0.05, false);
      });
      const polyline = runningCommand();
      assert.ok(polyline, 'the polyline is waiting for its next point');
      for (const id of ['wall.nextSheet', 'wall.prevSheet'] as const) {
        assert.equal(page(id).defaultPrevented, false, `${id} is left to the browser`);
        assert.equal(availableWallCommands().includes(id), false, `${id} is not on offer in the palette either`);
      }
      assert.deepEqual(stepped, [], 'still on the sheet');
      assert.equal(runningCommand(), polyline, 'the half-drawn polyline is still being drawn');
      // Done with the command: the keys step again.
      act(() => cancelCommand());
      assert.equal(page('wall.nextSheet').defaultPrevented, true);
      assert.deepEqual(stepped, [sheets[2].id]);
      // A drawing in front (the section tool brings the plan forward), with no command running: not on offer either.
      stepped.length = 0;
      stroke(document.body, WALL_KEY_COMMANDS.find((c) => c.id === 'wall.tool.sectionline')!.keys[0]);
      act(() => cancelCommand());
      assert.equal(runningCommand(), null);
      assert.equal(page('wall.nextSheet').defaultPrevented, false);
      assert.deepEqual(stepped, []);
    } finally {
      act(() => cancelCommand());
    }
  });

  it('performs every row of the keymap on the real sheet: each key is taken, none is left to the browser', () => {
    const sheets = useProjectStore.getState().sheets;
    render(<SteppedSheet sheet={sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    const printed: unknown[] = [];
    (window as unknown as { print: () => void }).print = () => { printed.push(1); };
    // Starting a tool brings its drawing forward, which takes the sheet's own Fit and Print away: the tools go last.
    const isTool = (id: string) => id.startsWith('wall.tool.') || id.startsWith('wall.draw.');
    for (const row of [...WALL_KEY_COMMANDS].sort((a, b) => Number(isTool(a.id)) - Number(isTool(b.id)))) {
      for (const chord of row.keys) {
        const event = keydown(chord);
        act(() => { document.body.dispatchEvent(event); });
        assert.equal(event.defaultPrevented, true, `${row.id} has a handler on the sheet`);
      }
    }
  });

  it('leaves the sheet on the key the person gave Back, and not on another', () => {
    const sheets = useProjectStore.getState().sheets;
    let backs = 0;
    rebindAction('wall.back', { key: 'g' });
    try {
      render(<SteppedSheet sheet={sheets[1]} extent={HOUSE} proposals={[]} onBack={() => { backs += 1; }} onStep={() => {}} />);
      stroke(document.body, { key: 'j' });
      assert.equal(backs, 0);
      stroke(document.body, { key: 'g' });
      assert.equal(backs, 1);
    } finally {
      resetAllBindings();
    }
  });

  it('gives the sheet\'s Fit and Print buttons the key of their row as aria-keyshortcuts (#119 review)', () => {
    setPlatform('Win32');
    const ui = render(<SteppedSheet sheet={useProjectStore.getState().sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    const named = (label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    assert.equal(named(t('wall.fit'))?.getAttribute('aria-keyshortcuts'), ariaKeyShortcuts('wall.fit', false));
    assert.equal(named(t('wall.export.pdf'))?.getAttribute('aria-keyshortcuts'), 'Control+P');
    for (const b of ui.querySelectorAll('button[title]')) {
      if (/\(([^)]+)\)$/.test(b.getAttribute('title') ?? '')) assert.ok(b.getAttribute('aria-keyshortcuts'), b.getAttribute('title') ?? '');
    }
  });

  it('runs a sheet button from the key a person gave it, and the button announces that key (#166)', () => {
    setPlatform('Win32');
    try {
      rebindAction('wall.paper', { key: 'code:KeyP', alt: true });
      const ui = render(<SteppedSheet sheet={useProjectStore.getState().sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
      const paper = () => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('wall.paper.button'));
      assert.equal(paper()?.getAttribute('aria-pressed'), 'false');
      assert.equal(paper()?.getAttribute('aria-keyshortcuts'), 'Alt+P');
      stroke(document.body, { key: 'code:KeyP', alt: true });
      assert.equal(paper()?.getAttribute('aria-pressed'), 'true');
      // Rebound while the sheet is showing: the button names the new key at once.
      act(() => { rebindAction('wall.paper', { key: 'code:KeyO', alt: true }); });
      assert.equal(paper()?.getAttribute('aria-keyshortcuts'), 'Alt+O');
    } finally {
      resetAllBindings();
    }
  });

  it('offers the whole keymap through the bus, and nothing once the sheet is left', () => {
    const sheets = useProjectStore.getState().sheets;
    render(<SteppedSheet sheet={sheets[0]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    // The first sheet has no previous one, and with no drawing in front there is no edit mode to leave: those rows are not on offer.
    assert.deepEqual(availableWallCommands(), WALL_KEY_COMMANDS.map((c) => c.id).filter((id) => id !== 'wall.prevSheet' && id !== 'wall.leaveEdit'));
    cleanup();
    assert.deepEqual(availableWallCommands(), []);
  });

  it('has a handler for every row (a row without one does not compile; this is the runtime twin)', () => {
    const f = () => {};
    const handlers = steppedHandlers({ startTool: f, toggleAdd: f, fit: f, print: f, previous: f, next: f, back: f, leaveEdit: f, comment: f, paper: f, titleBlock: f, revisions: f, printPreview: f, exportDxf: f });
    assert.deepEqual(Object.keys(handlers).sort(), WALL_KEY_COMMANDS.map((c) => c.id).sort());
    for (const handler of Object.values(handlers)) assert.equal(typeof handler, 'function');
  });
});

describe('the palette and the Wall\'s actions', () => {
  const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  beforeEach(() => {
    resetProject();
    startDrawingSet(null, HOUSE);
  });

  it('offers, while a sheet is stepped into, exactly the actions on offer, each with its key, and runs one the way the key does', () => {
    assert.deepEqual(buildWallCommands([]), []);
    const ui = render(<SteppedSheet sheet={useProjectStore.getState().sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    const actions = buildWallCommands([]);
    assert.deepEqual(actions.map((c) => c.id), availableWallCommands().map((id) => `wall:${id}`));
    for (const c of actions) assert.equal(c.id, `wall:${c.shortcut}`);
    const add = [...ui.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent?.trim() === 'Add a drawing');
    assert.equal(add?.getAttribute('aria-pressed'), 'false');
    act(() => actions.find((c) => c.shortcut === 'wall.addDrawing')?.action());
    assert.equal(add?.getAttribute('aria-pressed'), 'true');
  });
});


describe('the drafting keys the shortcut list shows (#119 review)', () => {
  /** The keydown of a row's chord, as the browser sends it. */
  const draftingKey = (chord: (typeof DRAFTING_KEY_COMMANDS)[number]['keys'][number]): KeyboardEvent => new window.KeyboardEvent('keydown', {
    key: chord.key === ' ' ? ' ' : chord.key.length === 1 ? chord.key : chord.key.charAt(0).toUpperCase() + chord.key.slice(1).replace(/^(f\d+)$/i, (m) => m.toUpperCase()),
    ctrlKey: 'mod' in chord, shiftKey: 'shift' in chord, bubbles: true, cancelable: true,
  });

  it('are the keys the drafting view performs: F3 snap, F8 ortho, Ctrl+Z undo, each read from its row', () => {
    const typed: string[] = [];
    const { handlers } = counting();
    render(<WithCommandLine handlers={handlers} typed={typed} />);
    const row = (id: string) => DRAFTING_KEY_COMMANDS.find((c) => c.id === id)!;
    const snap = useDraftingSession.getState().snap;
    act(() => { document.body.dispatchEvent(draftingKey(row('drafting.snap').keys[0])); });
    assert.equal(useDraftingSession.getState().snap, !snap, 'F3 toggles snap');
    const ortho = useDraftingSession.getState().ortho;
    act(() => { document.body.dispatchEvent(draftingKey(row('drafting.ortho').keys[0])); });
    assert.equal(useDraftingSession.getState().ortho, !ortho, 'F8 toggles ortho');
    for (const id of ['drafting.undo', 'drafting.redo', 'drafting.confirm'] as const) {
      for (const chord of row(id).keys) {
        const event = draftingKey(chord);
        act(() => { document.body.dispatchEvent(event); });
        assert.equal(event.defaultPrevented, true, `${id} ${JSON.stringify(chord)} is taken by the drafting view`);
      }
    }
    assert.deepEqual(typed, [], 'none of them typed into the command line');
  });

  it('redoes on Ctrl+Shift+Z, which the undo row (Ctrl+Z) would also take if its modifiers did not have to match', () => {
    resetProject();
    clearDraftHistory();
    const typed: string[] = [];
    const { handlers } = counting();
    render(<WithCommandLine handlers={handlers} typed={typed} />);
    editDrafts({ add: [newDraft('view-1', '0', { type: 'text', p: { x: 0, y: 0 }, text: 'A', height: 0.25, rotation: 0 })] });
    undoLatest();
    assert.equal(useProjectStore.getState().drafts.length, 0, 'undone');
    const event = new window.KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(event); });
    assert.equal(event.defaultPrevented, true);
    assert.equal(useProjectStore.getState().drafts.length, 1, 'Ctrl+Shift+Z redid the text');
  });
});
