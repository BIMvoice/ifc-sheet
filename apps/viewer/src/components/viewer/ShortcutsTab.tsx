/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Info dialog's Shortcuts tab, generated from the keyboard command table
 * (`lib/commands/keyboard-commands.ts`, #5836). Nothing here lists a key by
 * hand: a row exists because a command declares the key, and its glyphs are
 * formatted for the platform the viewer runs on. On IfcSheet's face it opens
 * the keyboard settings, where the Wall's actions are rebound (#166).
 */

import { useState } from 'react';
import { useTranslation, type TranslationKey, type TranslationParameters } from '@/i18n';
import { ALT_SHORTCUT_PANELS } from '@/lib/panels/registry';
import { isApplePlatform } from '@/lib/commands/chord';
import { isDocsEdition } from '@/edition';
import {
  KEY_COMMANDS,
  KEY_COMMAND_CATEGORIES,
  POINTER_GESTURES,
  type KeyCommandCategory,
  type KeyCommandDefinition,
} from '@/lib/commands/keyboard-commands';
import { shownOnTheWall } from '@/lib/commands/wall-key-commands';
import { formatCommandKeys } from '@/lib/commands/shortcut-label';
import { isWallAction } from '@/lib/commands/action-registry';
import { effectiveKeys, useKeyBindingsRevision } from '@/lib/commands/key-bindings';
import { KeyboardSettings } from './wall/KeyboardSettings';

interface ShortcutRow {
  readonly id: string;
  readonly keys: string;
  readonly labelKey: TranslationKey;
  readonly params?: TranslationParameters;
}

function rowsByCategory(commands: readonly KeyCommandDefinition[], gestures: typeof POINTER_GESTURES, apple: boolean,
  gestureKeys: (row: (typeof POINTER_GESTURES)[number]) => string, panelTitles: { sidePanels: string; bottomPanels: string }) {
  const rows = new Map<KeyCommandCategory, ShortcutRow[]>();
  const push = (category: KeyCommandCategory, row: ShortcutRow) => {
    const list = rows.get(category) ?? [];
    list.push(row);
    rows.set(category, list);
  };
  for (const command of commands) {
    // The keys in force: a Wall action the person rebound lists its new key (#166).
    const keys = isWallAction(command.id) ? formatCommandKeys({ ...command, keys: effectiveKeys(command.id) }, apple) : formatCommandKeys(command, apple);
    // An action with no key (shipped so, or left so) is not a shortcut; the keyboard settings list it.
    if (!keys) continue;
    push(command.category, {
      id: command.id,
      keys,
      labelKey: command.labelKey,
      params: command.id === 'ui.openPanel' ? panelTitles : undefined,
    });
  }
  for (const gesture of gestures) {
    push(gesture.category, { id: gesture.id, keys: gestureKeys(gesture), labelKey: gesture.labelKey });
  }
  return KEY_COMMAND_CATEGORIES.flatMap((category) => {
    const list = rows.get(category);
    return list ? [{ category, rows: list }] : [];
  });
}

/**
 * `commands` is every row the list shows (the keymap by default; on
 * IfcSheet's face, the Wall's rows and the two global ones that work there).
 * A row is drawn for each, so the list can only name keys the table has.
 */
export function ShortcutsTab({ commands }: { commands?: readonly KeyCommandDefinition[] } = {}) {
  const { t } = useTranslation();
  const wall = isDocsEdition();
  useKeyBindingsRevision();
  const [customising, setCustomising] = useState(false);
  if (customising) return <KeyboardSettings onDone={() => setCustomising(false)} />;
  const rows = commands ?? (wall ? shownOnTheWall(KEY_COMMANDS) : KEY_COMMANDS);
  const apple = isApplePlatform();
  const altPanelTitles = (bottom: boolean) => ALT_SHORTCUT_PANELS
    .filter((panel) => (panel.region === 'bottom') === bottom)
    .map((panel) => t(panel.titleKey)).join(', ');
  const groups = rowsByCategory(rows, wall ? [] : POINTER_GESTURES, apple, (gesture) => t(gesture.gestureKey, { mod: apple ? '⌘' : 'Ctrl' }),
    { sidePanels: altPanelTitles(false), bottomPanels: altPanelTitles(true) });

  return (
    <div className="space-y-4">
      {/* Learn-more row: drives discovery to the marketing site and the github.io
          docs. Sits above the shortcut groups so it's the first thing users hunting
          for help see, without crowding the keyboard reference itself. */}
      <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t('keyboardShortcuts.shortcuts.learnMore')}</span>
        <a
          href="https://ifclite.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 underline-offset-2 hover:underline hover:text-primary transition-colors"
        >
          {t('keyboardShortcuts.shortcuts.homepageLink')}
        </a>
        <span className="mx-1.5 opacity-40">·</span>
        <a
          href="https://ifclite.dev/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline hover:text-primary transition-colors"
        >
          {t('keyboardShortcuts.shortcuts.docsLink')}
        </a>
      </div>
      {wall ? (
        <button type="button" className="rounded border border-border px-3 py-1 text-sm hover:bg-muted" onClick={() => setCustomising(true)}>
          {t('wall.keys.customise')}
        </button>
      ) : null}
      {groups.map(({ category, rows }) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {t(`commands.category.${category}`)}
          </h3>
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.id}
                data-shortcut-command={row.id}
                className="flex items-center justify-between gap-3 py-1"
              >
                <span className="text-sm">{t(row.labelKey, row.params)}</span>
                <kbd className="shrink-0 px-2 py-0.5 text-xs bg-muted rounded border font-mono">
                  {row.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
