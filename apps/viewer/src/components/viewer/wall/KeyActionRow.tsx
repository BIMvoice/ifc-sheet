/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One action in the keyboard settings (#166): its name, the key in force
 * (announced through `aria-keyshortcuts`), and Change / Remove / Reset. Change
 * turns its own button into the recorder, so focus stays where it was: the
 * next key or combination pressed there becomes the binding. Escape, Tab or
 * leaving the button cancels; Tab still moves focus, so a keyboard user is
 * never held in it.
 */

import { useTranslation } from '@/i18n';
import { chordFromEvent, type KeyChord } from '@/lib/commands/chord';
import type { WallActionId } from '@/lib/commands/action-registry';

const button = 'rounded border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50';

interface KeyActionRowProps {
  id: WallActionId;
  name: string;
  /** The key in force, written for the platform, or the "no key" text. */
  keys: string;
  /** The same key as `aria-keyshortcuts` writes it; empty when unbound. */
  aria: string;
  customised: boolean;
  bound: boolean;
  recording: boolean;
  onRecord: () => void;
  onCancel: () => void;
  onRecorded: (chord: KeyChord) => void;
  onRemove: () => void;
  onReset: () => void;
}

export function KeyActionRow({ id, name, keys, aria, customised, bound, recording, onRecord, onCancel, onRecorded, onRemove, onReset }: KeyActionRowProps) {
  const { t } = useTranslation();
  return (
    <li data-key-action={id} className="flex flex-wrap items-center gap-2 py-0.5">
      <span className="min-w-0 flex-1">{name}</span>
      {customised ? <span className="text-xs text-muted-foreground">{t('wall.keys.changed')}</span> : null}
      <kbd aria-keyshortcuts={aria || undefined} className="shrink-0 rounded border bg-muted px-2 py-0.5 font-mono text-xs">{keys}</kbd>
      <button
        type="button"
        className={button}
        data-recording={recording ? '' : undefined}
        aria-label={recording ? t('wall.keys.recordingAria', { action: name }) : t('wall.keys.changeAria', { action: name })}
        onClick={() => { if (!recording) onRecord(); }}
        onBlur={() => { if (recording) onCancel(); }}
        onKeyDown={(e) => {
          if (!recording) return;
          if (e.key === 'Tab') {
            onCancel();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') {
            onCancel();
            return;
          }
          const chord = chordFromEvent(e.nativeEvent);
          if (chord) onRecorded(chord);
        }}
      >
        {recording ? t('wall.keys.recording') : t('wall.keys.change')}
      </button>
      <button type="button" className={button} disabled={!bound} aria-label={t('wall.keys.removeAria', { action: name })} onClick={onRemove}>{t('wall.keys.remove')}</button>
      <button type="button" className={button} disabled={!customised} aria-label={t('wall.keys.resetAria', { action: name })} onClick={onReset}>{t('wall.keys.reset')}</button>
    </li>
  );
}
