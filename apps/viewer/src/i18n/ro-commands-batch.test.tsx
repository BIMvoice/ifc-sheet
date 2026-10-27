/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { ShortcutsTab } from '@/components/viewer/ShortcutsTab';
import { KEY_COMMANDS } from '@/lib/commands/keyboard-commands';
import { commandsRo } from './catalogues/commands.ro';
import { draftingRo } from './catalogues/drafting.ro';
import { checkCatalogue } from './catalogue-problems';
import { en, type TranslationKey } from './en';
import { registerLocale, resolve, setLocale } from './registry';
import ro from './locales/ro';

/**
 * #526, second batch: the `commands.*` rows of the keyboard reference (the Info dialog's Shortcuts tab
 * and the command palette read the same table) and the drafting axis and line-type choices read in
 * Romanian under the Romanian locale, with none of the English values left.
 */
beforeEach(() => {
  registerLocale('ro', checkCatalogue(ro).catalogue);
  act(() => setLocale('ro'));
});
afterEach(() => {
  cleanup();
  act(() => setLocale('en'));
});

const COMMAND_KEYS = Object.keys(commandsRo) as TranslationKey[];
const RO: Readonly<Record<string, string>> = commandsRo;
/** The English value of a command row: every `commands.*` row is a plain string. */
const english = (key: string): string => {
  const value: unknown = (en as Record<string, unknown>)[key];
  assert.equal(typeof value, 'string', `${key} is a plain string in English`);
  return value as string;
};

describe('commands.* in Romanian', () => {
  it('translates all 107 rows, each different from its English value', () => {
    assert.equal(COMMAND_KEYS.length, 107);
    const same = COMMAND_KEYS.filter((key) => RO[key] === english(key));
    assert.deepEqual(same, []);
  });

  it('shows no English label of those rows on the Shortcuts tab', () => {
    const ui = render(<ShortcutsTab commands={KEY_COMMANDS} />);
    const text = ui.textContent ?? '';
    const shown = new Set<string>(KEY_COMMANDS.map((c) => c.labelKey));
    const checked = COMMAND_KEYS.filter((key) => shown.has(key) && !key.endsWith('.keys') && !english(key).includes('{'));
    assert.ok(checked.length > 60, `only ${checked.length} translated rows are on the tab`);
    for (const key of checked) {
      assert.ok(text.includes(RO[key]), `${key} is not in Romanian on the tab`);
      // An English value that is a prefix of a Romanian one cannot occur, so a plain substring test is exact.
      assert.ok(!text.includes(english(key)), `English "${english(key)}" is still on the tab`);
    }
    assert.match(text, /Vedere din față/);
  });

  it('translates the pointer gestures and their key labels, which the Wall edition does not list', () => {
    assert.equal(resolve('commands.gesture.fineZoom.keys', { mod: 'Ctrl' }), 'Ctrl + rotița mausului');
    assert.equal(resolve('commands.gesture.panDrag'), 'Deplasare');
  });

  it('fills the panel lists into the open-panel row', () => {
    const ui = render(<ShortcutsTab commands={KEY_COMMANDS} />);
    assert.match(ui.textContent ?? '', /Deschide un panou din bară \(.+; .+ se deschid jos\)/);
  });
});

describe('drafting choices in Romanian', () => {
  it('names the axis bubble shapes, the bubble ends and the line types', () => {
    const keys = Object.keys(draftingRo).filter((k) => /^drafting\.props\.(axisBubble|axisEnds|lineType)\./.test(k)) as TranslationKey[];
    assert.equal(keys.length, 10);
    for (const key of keys) assert.notEqual(resolve(key), english(key), key);
    assert.equal(resolve('drafting.props.lineType.dashdot'), 'Linie-punct');
  });
});
