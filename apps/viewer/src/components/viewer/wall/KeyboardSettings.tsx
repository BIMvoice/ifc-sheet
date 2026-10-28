/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's keyboard settings (#166): every action of the registry with the
 * key in force, a search, rebinding by pressing the key or combination, and
 * reset, export and import. What it changes is `key-bindings.ts`, which every
 * key handler, tooltip and `aria-keyshortcuts` reads, so a new key works at
 * once. The panel keeps its own keys (`data-owns-keys`): nothing pressed in it
 * reaches the Wall or a running tool.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { downloadFile } from '@/lib/export/download';
import { WALL_ACTIONS, type WallActionId } from '@/lib/commands/action-registry';
import { formatChord, type KeyChord } from '@/lib/commands/chord';
import { IMPORT_MAX_CHARS, exportKeyBindings, importKeyBindings, isCustomised, presetBinding, rebindAction, resetAction, resetAllBindings, takeDroppedBindings, unbindAction, useKeyBindingsRevision, type RebindOutcome } from '@/lib/commands/key-bindings';
import { KEY_COMMANDS, type KeyCommandCategory } from '@/lib/commands/keyboard-commands';
import { ariaKeyShortcuts, shortcutLabel } from '@/lib/commands/shortcut-label';
import { AutocadModeSetting } from './AutocadModeSetting';
import { KeyPresetSetting } from './KeyPresetSetting';
import { KeyActionRow } from './KeyActionRow';

const LABELS = new Map(KEY_COMMANDS.map((c) => [c.id as string, c.labelKey]));
const GROUPS: readonly { category: KeyCommandCategory; titleKey: 'wall.keys.category.wall' | 'wall.keys.category.drafting' }[] = [
  { category: 'wall', titleKey: 'wall.keys.category.wall' },
  { category: 'drafting', titleKey: 'wall.keys.category.drafting' },
];
export const KEYBOARD_FILE_NAME = 'ifcsheet-keyboard.json';

const button = 'rounded border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-50';

type Note = { readonly text: string; readonly error: boolean } | null;

export function KeyboardSettings({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  useKeyBindingsRevision();
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<WallActionId | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const name = (id: string): string => {
    const key = LABELS.get(id);
    return key ? t(key) : id;
  };
  const keysOf = (id: WallActionId): string => shortcutLabel(id);
  const say = (text: string, error = false) => setNote({ text, error });
  const refused = (outcome: Exclude<RebindOutcome, { ok: true }>, keys: string) => say(
    outcome.reason === 'conflict' ? t('wall.keys.conflict', { keys, other: name(outcome.holder) }) : t('wall.keys.reserved', { keys }),
    true,
  );

  const record = (id: WallActionId, chord: KeyChord) => {
    setRecording(null);
    const outcome = rebindAction(id, chord);
    if (outcome.ok) say(t('wall.keys.saved', { action: name(id), keys: keysOf(id) }));
    else refused(outcome, formatChord(chord));
  };
  const reset = (id: WallActionId) => {
    const outcome = resetAction(id);
    if (outcome.ok) say(t('wall.keys.resetOne', { action: name(id) }));
    else refused(outcome, presetBinding(id).map((c) => formatChord(c)).join(', '));
  };
  const remove = (id: WallActionId) => {
    unbindAction(id);
    say(t('wall.keys.removed', { action: name(id) }));
  };
  const resetAll = () => {
    resetAllBindings();
    setConfirmingReset(false);
    say(t('wall.keys.resetAllDone'));
  };
  const tooLarge = () => say(t('wall.keys.importTooLarge', { kb: IMPORT_MAX_CHARS / 1024 }), true);
  const importText = (text: string) => {
    const outcome = importKeyBindings(text);
    if (!outcome.ok) {
      if (outcome.reason === 'conflict') say(t('wall.keys.importConflict', { keys: formatChord(outcome.chord), first: name(outcome.first), second: name(outcome.second) }), true);
      else if (outcome.reason === 'reserved') say(t('wall.keys.reserved', { keys: formatChord(outcome.chord) }), true);
      else if (outcome.reason === 'tooMany') say(t('wall.keys.importTooMany', { action: name(outcome.action), max: outcome.max }), true);
      else if (outcome.reason === 'tooLarge') tooLarge();
      else say(t('wall.keys.importInvalid'), true);
      return;
    }
    const done = outcome.applied > 0 ? t('wall.keys.imported', { count: outcome.applied }) : t('wall.keys.importedNone');
    say(outcome.skipped > 0 ? `${done} ${t('wall.keys.importSkipped', { count: outcome.skipped })}` : done);
  };

  // Saved keys that collided at load were left out: say so, once.
  useEffect(() => {
    const dropped = takeDroppedBindings();
    if (dropped > 0) setNote({ text: t('wall.keys.storedDropped', { count: dropped }), error: false });
  }, [t]);

  const needle = query.trim().toLowerCase();
  const shown = WALL_ACTIONS.filter((a) => !needle || name(a.id).toLowerCase().includes(needle) || keysOf(a.id).toLowerCase().includes(needle));

  return (
    <section data-owns-keys aria-labelledby="keyboard-settings-title" className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 id="keyboard-settings-title" className="m-0 text-base font-medium">{t('wall.keys.title')}</h3>
        {onDone ? <button type="button" className={button} onClick={onDone}>{t('wall.keys.done')}</button> : null}
      </div>
      <p className="m-0 text-muted-foreground">{t('wall.keys.intro')}</p>
      <p className="m-0 text-xs text-muted-foreground">{t('wall.keys.bareHint')}</p>
      <KeyPresetSetting onChanged={(text) => say(text)} />
      <AutocadModeSetting onChanged={(text) => say(text)} />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('wall.keys.search')}
        placeholder={t('wall.keys.search')}
        className="w-full rounded border border-border bg-background px-2 py-1"
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} onClick={() => downloadFile(exportKeyBindings(), KEYBOARD_FILE_NAME, 'application/json')}>{t('wall.keys.export')}</button>
        <button type="button" className={button} onClick={() => fileInput.current?.click()}>{t('wall.keys.import')}</button>
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label={t('wall.keys.importChoose')} className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          // A file over the cap is refused unread: it could be any size.
          if (file.size > IMPORT_MAX_CHARS) tooLarge();
          else void file.text().then(importText, () => say(t('wall.keys.importInvalid'), true));
        }} />
        {confirmingReset ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{t('wall.keys.resetAllConfirm')}</span>
            <button type="button" className={button} onClick={resetAll}>{t('wall.keys.resetAll')}</button>
            <button type="button" className={button} onClick={() => setConfirmingReset(false)}>{t('wall.keys.keep')}</button>
          </span>
        ) : (
          <button type="button" className={button} onClick={() => setConfirmingReset(true)}>{t('wall.keys.resetAll')}</button>
        )}
      </div>
      <output aria-live="polite" className="block min-h-5">{note && !note.error ? note.text : ''}</output>
      <div role="alert" className="text-red-600 dark:text-red-400">{note?.error ? note.text : ''}</div>
      {shown.length === 0 ? <p className="m-0">{t('wall.keys.searchEmpty', { query })}</p> : null}
      {GROUPS.map(({ category, titleKey }) => {
        const rows = shown.filter((a) => a.category === category);
        if (rows.length === 0) return null;
        return (
          <div key={category}>
            <h4 id={`keyboard-settings-${category}`} className="m-0 mb-1 text-sm font-medium text-muted-foreground">{t(titleKey)}</h4>
            <ul aria-labelledby={`keyboard-settings-${category}`} className="m-0 list-none space-y-1 p-0">
              {rows.map((a) => (
                <KeyActionRow
                  key={a.id}
                  id={a.id}
                  name={name(a.id)}
                  keys={keysOf(a.id) || t('wall.keys.none')}
                  aria={ariaKeyShortcuts(a.id)}
                  customised={isCustomised(a.id)}
                  bound={keysOf(a.id) !== ''}
                  recording={recording === a.id}
                  onRecord={() => { setNote(null); setRecording(a.id); }}
                  onCancel={() => setRecording((r) => (r === a.id ? null : r))}
                  onRecorded={(chord) => record(a.id, chord)}
                  onRemove={() => remove(a.id)}
                  onReset={() => reset(a.id)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
