/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
(globalThis as unknown as { __BUILD_DATE__: string }).__BUILD_DATE__ = '2026-01-01T00:00:00.000Z';
(globalThis as unknown as { __PACKAGE_VERSIONS__: Array<{ name: string; version: string }> }).__PACKAGE_VERSIONS__ = [{ name: '@ifc-lite/viewer', version: '0.0.0-test' }];
(globalThis as unknown as { __RELEASE_HISTORY__: unknown[] }).__RELEASE_HISTORY__ = [];

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act, useRef, useState } from 'react';
import { cleanup, press, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, pressEscape, useDraftingSession } from '@/drafting/session';
import { CommandLine } from '@/components/viewer/drafting/CommandLine.js';
import { useDraftingKeys } from '@/components/viewer/drafting/useDraftingKeys.js';
import { submitTypedLine } from '@/components/viewer/drafting/typed-line.js';
import { KeyboardShortcutsDialog } from '@/components/viewer/KeyboardShortcutsDialog.js';
import { checkCatalogue } from './catalogue-problems';
import { registerLocale, resolve, setLocale } from './registry';
import ro from './locales/ro';

/**
 * Romanian on the drawing command line and the Info dialog (#314): the prompts,
 * results and errors read in Romanian, the command names stay as typed, and a count
 * takes the Romanian form of its noun (1 subiect, 2 subiecte, 20 de subiecte).
 */

function Drafting() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  useDraftingKeys({ inputRef, setText, submit: () => submitTypedLine('', null) });
  return (
    <CommandLine
      ref={inputRef}
      value={text}
      onChange={setText}
      onSubmit={() => { submitTypedLine(text, null); setText(''); }}
      onEscape={() => { setText(''); pressEscape(); }}
    />
  );
}

const enter = (line: HTMLInputElement, text: string): void => {
  for (const ch of text) press(document.body, ch);
  press(line, 'Enter');
};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
  attachDraftingView('view-1', 'down', () => []);
  registerLocale('ro', checkCatalogue(ro).catalogue);
  act(() => setLocale('ro'));
});
afterEach(() => {
  cleanup();
  cancelCommand();
  act(() => setLocale('en'));
});

describe('the drawing command line in Romanian (#314)', () => {
  it('prompts, answers and refuses in Romanian while the command is typed as it is', () => {
    const ui = render(<Drafting />);
    const line = ui.querySelector('input') as HTMLInputElement;
    assert.match(ui.textContent ?? '', /Comandă:/);
    assert.equal(line.getAttribute('aria-label'), 'Linia de comandă');
    enter(line, 'line');
    assert.match(ui.textContent ?? '', /Specificați primul punct:/);
    assert.doesNotMatch(ui.textContent ?? '', /Specify first point/);
    enter(line, '0,0');
    assert.match(ui.textContent ?? '', /Specificați punctul următor \[Close \/ Undo\]/);
    act(() => pressEscape());
    assert.match(ui.textContent ?? '', /\*Anulat\*/);
    enter(line, 'zzz');
    assert.match(ui.textContent ?? '', /Comandă necunoscută „zzz”\./);
  });

  it('keeps the typed names of the commands', () => {
    for (const key of ['drafting.cmd.line', 'drafting.cmd.tagAll', 'drafting.cmd.dimAll', 'drafting.cmd.levelAll'] as const) {
      assert.match(resolve(key), /^[A-Z]+$/);
    }
    assert.equal(resolve('drafting.cmd.tagAll'), 'TAGALL');
  });

  it('says what TAGALL, DIMALL and LEVELALL did in Romanian', () => {
    assert.equal(resolve('drafting.msg.tagAllDone', { marks: 31, rooms: 18, already: 0 }), 'Etichetate: uși și ferestre: 31, încăperi: 18. Deja etichetate: 0.');
    assert.match(resolve('drafting.msg.tagAllTooSmall', { count: 18 }), /^18 încăperi sunt mai mici decât etichetele lor/);
    assert.match(resolve('drafting.msg.tagAllTooSmall', { count: 20 }), /^20 de încăperi sunt mai mici/);
    assert.match(resolve('drafting.msg.levelAllDoneLeft', { count: 3, already: 0 }), /în stânga clădirii/);
    assert.match(resolve('drafting.msg.dimAllDone', { count: 12, strings: 4, skipped: 0 }), /^Cote adăugate: 12/);
    assert.match(resolve('drafting.msg.notAnElement'), /^Niciun element al modelului acolo/);
  });
});

describe('Romanian plurals take the form of their noun (#314)', () => {
  const forms = (key: Parameters<typeof resolve>[0], pick: (n: number) => Record<string, number>): string[] => [1, 2, 20].map((n) => resolve(key, pick(n)));

  it('the BCF subjects: 1 subiect, 2 subiecte, 20 de subiecte', () => {
    const [one, two, twenty] = forms('review.bcf.imported', (count) => ({ count, merged: 0, unplaced: 0 }));
    assert.match(one, /^Un subiect a devenit comentariu\./);
    assert.match(two, /^2 subiecte au devenit comentarii\./);
    assert.match(twenty, /^20 de subiecte au devenit comentarii\./);
  });

  it('the exported comments: 1 comentariu, 2 comentarii, 20 de comentarii', () => {
    const [one, two, twenty] = forms('review.bcf.exported', (count) => ({ count, onElement: 1 }));
    assert.equal(one, 'Comentariul se află pe un element al modelului și a intrat în fișierul BCF.');
    assert.match(two, /1 din 2 comentarii\.$/);
    assert.match(twenty, /1 din 20 de comentarii\.$/);
    assert.doesNotMatch(one, /1 din 1/);
  });

  it('the command line counts: obiecte șterse, cote de nivel aliniate, șiruri de cote', () => {
    assert.deepEqual(forms('drafting.msg.erased', (count) => ({ count })), ['1 obiect șters.', '2 obiecte șterse.', '20 de obiecte șterse.']);
    assert.deepEqual(forms('drafting.msg.levelAligned', (count) => ({ count })), ['1 cotă de nivel aliniată.', '2 cote de nivel aliniate.', '20 de cote de nivel aliniate.']);
    assert.match(resolve('drafting.msg.dimAllHeads', { count: 1 }), /^Un șir de cote trece/);
    assert.match(resolve('drafting.msg.dimAllHeads', { count: 20 }), /^20 de șiruri de cote trec/);
    assert.match(resolve('drafting.msg.dimAllDropped', { count: 1 }), /^Un șir de cote a fost lăsat deoparte/);
    assert.match(resolve('drafting.msg.dimAllDropped', { count: 20 }), /^20 de șiruri de cote au fost lăsate deoparte/);
  });

  it('the Info dialog counts: pachet, modificare', () => {
    assert.deepEqual(forms('keyboardShortcuts.about.packagesCount', (count) => ({ count })), ['1 pachet', '2 pachete', '20 de pachete']);
    assert.deepEqual(forms('keyboardShortcuts.whatsNew.changeCount', (count) => ({ count })), ['1 modificare', '2 modificări', '20 de modificări']);
  });
});

describe('the sheet templates in Romanian (#314)', () => {
  it('names the built-in templates in Romanian, not "A1 plans"', () => {
    assert.equal(resolve('wall.template.a1-plans'), 'Planuri');
    assert.equal(resolve('wall.template.a3-schedules'), 'Tabele');
  });
});

describe('the Info dialog in Romanian (#314)', () => {
  it('reads Romanian in the header, the tab strip, the footer and the About tab', () => {
    render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab="about" />);
    const text = document.body.textContent ?? '';
    for (const word of ['Informații', 'Despre', 'Noutăți', 'Comenzi rapide', 'Învățare', 'Comandați din orice LLM', 'pentru a afișa sau a ascunde acest panou', 'Raportați o problemă', '1 pachet']) {
      assert.ok(text.includes(word), `${word} in the Info dialog: ${text.slice(0, 400)}`);
    }
    assert.doesNotMatch(text, /What's New|Drive from any LLM|to toggle this panel|Report issue/);
  });

  it('reads Romanian on the Shortcuts tab and names its groups', () => {
    render(<KeyboardShortcutsDialog open onClose={() => {}} initialTab="shortcuts" />);
    const text = document.body.textContent ?? '';
    assert.ok(text.includes('Aflați mai multe:'), text.slice(0, 300));
    assert.doesNotMatch(text, /Learn more:/);
    assert.equal(resolve('commands.category.wall'), 'Panoul');
  });
});
