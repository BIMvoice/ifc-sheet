/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The key presets (#166): a named set of bindings under the person's own.
 * A preset is DATA, one table of the actions it gives other keys than the
 * registry ships (`action-registry.ts`); what it leaves out keeps its shipped
 * key. The person's own rebindings (`key-bindings.ts`) are a "Custom" layer on
 * top of the chosen preset, and "reset to preset" drops that layer.
 *
 * The tables go through the same conflict check as a person's rebinding
 * (`presetConflict` in `key-bindings.ts`, run over every preset by a test), so
 * a preset cannot give one key to two actions.
 *
 * "AutoCAD-like" is the keys an AutoCAD user reaches for; it is a separate
 * choice from AutoCAD mode (`autocad-mode.ts`, typed names and Enter to
 * repeat), which the keyboard settings offer beside it and never turn on by
 * themselves.
 */

import type { TranslationKey } from '@/i18n';
import type { BindingOverrides } from './key-bindings';

export type KeyPresetId = 'default' | 'autocad';

export interface KeyPreset {
  readonly id: KeyPresetId;
  readonly labelKey: TranslationKey;
  readonly hintKey: TranslationKey;
  /** What this preset binds differently from the shipped keys. */
  readonly keys: BindingOverrides;
}

export const KEY_PRESETS: readonly KeyPreset[] = [
  // The keys as the registry ships them: nothing to override, so "today's bindings, exactly" holds by construction.
  { id: 'default', labelKey: 'wall.keys.preset.default', hintKey: 'wall.keys.preset.defaultHint', keys: {} },
  {
    id: 'autocad',
    labelKey: 'wall.keys.preset.autocad',
    hintKey: 'wall.keys.preset.autocadHint',
    keys: {
      // Ctrl+Y first, as AutoCAD names it (Ctrl+Shift+Z stays).
      'drafting.redo': [{ key: 'y', mod: true }, { key: 'z', mod: true, shift: true }],
      // Backspace edits the command line in AutoCAD; only Delete erases.
      'drafting.erase': [{ key: 'delete' }],
      // Ctrl+PageUp / Ctrl+PageDown change layout in AutoCAD. A browser may keep them for its own tabs, so the plain keys stay.
      'wall.prevSheet': [{ key: 'pageup', mod: true }, { key: 'pageup' }],
      'wall.nextSheet': [{ key: 'pagedown', mod: true }, { key: 'pagedown' }],
    },
  },
];

const BY_ID: ReadonlyMap<string, KeyPreset> = new Map(KEY_PRESETS.map((p) => [p.id, p]));

export function isKeyPresetId(id: unknown): id is KeyPresetId {
  return typeof id === 'string' && BY_ID.has(id);
}

export function presetKeys(id: KeyPresetId): BindingOverrides {
  return BY_ID.get(id)?.keys ?? {};
}
