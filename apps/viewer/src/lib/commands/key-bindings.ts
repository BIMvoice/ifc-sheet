/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The keys in force (#166): the registry's defaults (`action-registry.ts`)
 * with what this person rebound laid over them. Only the differences are kept,
 * per browser, in `localStorage`; a set can be exported to a file and imported
 * on another machine, so an office can share one. Storage that is blocked
 * (private window, a policy) leaves the defaults working and the changes
 * holding for the session.
 *
 * A rebinding is refused, and says why, when another Wall action or a key the
 * Wall keeps for itself already has the combination, or when the key moves
 * focus between controls (Tab): a keyboard user must always be able to leave.
 */

import { create } from 'zustand';
import { RESERVED_ON_THE_WALL, WALL_ACTIONS, defaultKeys, isWallAction, type WallActionId } from './action-registry';
import type { KeyChord } from './chord';
import { KEY_COMMANDS } from './keyboard-commands';

/** The person's bindings, by action id: an empty list is an action they left without a key. */
export type BindingOverrides = Readonly<Partial<Record<WallActionId, readonly KeyChord[]>>>;

export const KEY_BINDINGS_STORAGE_KEY = 'ifcsheet:key-bindings';
const FILE_FORMAT = 'ifcsheet-keyboard';
const FILE_VERSION = 1;
const BUILTIN: ReadonlyMap<string, readonly KeyChord[]> = new Map(KEY_COMMANDS.map((c) => [c.id, c.keys]));

/** The physical key a chord names, so `Alt+code:Digit1` and an `Alt+1` written by hand are the same slot. */
function slot(chord: KeyChord): string {
  const key = chord.key.startsWith('code:Digit') ? chord.key.slice('code:Digit'.length)
    : /^code:Key[A-Z]$/.test(chord.key) ? chord.key.slice('code:Key'.length).toLowerCase() : chord.key;
  return [chord.mod ? 'mod' : '', chord.alt ? 'alt' : '', chord.shift ? 'shift' : '', chord.double ? 'double' : '', key].join('|');
}

/** A chord as a file or storage may carry it: a key name and the three modifiers, nothing else. */
function cleanChord(raw: unknown): KeyChord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0 || r.key.length > 32) return null;
  for (const flag of ['mod', 'alt', 'shift'] as const) if (r[flag] !== undefined && r[flag] !== true) return null;
  return { key: r.key, ...(r.mod ? { mod: true as const } : {}), ...(r.alt ? { alt: true as const } : {}), ...(r.shift ? { shift: true as const } : {}) };
}

interface Parsed { overrides: BindingOverrides; skipped: number }

/** The bindings a stored or imported text holds, or null when it is not a keyboard set. Ids this Wall does not have are counted and left out. */
function parse(text: string): Parsed | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.format !== FILE_FORMAT || d.version !== FILE_VERSION || typeof d.bindings !== 'object' || d.bindings === null) return null;
  const overrides: Partial<Record<WallActionId, readonly KeyChord[]>> = {};
  let skipped = 0;
  for (const [id, chords] of Object.entries(d.bindings as Record<string, unknown>)) {
    if (!isWallAction(id)) { skipped += 1; continue; }
    if (!Array.isArray(chords)) return null;
    const clean = chords.map(cleanChord);
    if (clean.some((c) => c === null)) return null;
    overrides[id] = clean as KeyChord[];
  }
  return { overrides, skipped };
}

function serialise(overrides: BindingOverrides): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, bindings: overrides }, null, 2);
}

function stored(): BindingOverrides {
  try {
    const text = globalThis.localStorage?.getItem(KEY_BINDINGS_STORAGE_KEY);
    const parsed = text ? parse(text) : null;
    // A stored set that conflicts (written by an older build, edited by hand) is not trusted: the defaults hold.
    return parsed && !firstConflict(parsed.overrides) ? parsed.overrides : {};
  } catch {
    return {};
  }
}

export const useKeyBindings = create<{ overrides: BindingOverrides }>()(() => ({ overrides: stored() }));

function commit(overrides: BindingOverrides): void {
  useKeyBindings.setState({ overrides });
  try {
    if (Object.keys(overrides).length === 0) globalThis.localStorage?.removeItem(KEY_BINDINGS_STORAGE_KEY);
    else globalThis.localStorage?.setItem(KEY_BINDINGS_STORAGE_KEY, serialise(overrides));
  } catch {
    // Storage unavailable: the bindings hold for this session.
  }
}

/** Read the saved bindings again (another tab saved, or a test changed storage). */
export function loadKeyBindings(): void {
  useKeyBindings.setState({ overrides: stored() });
}

function keysIn(overrides: BindingOverrides, id: string): readonly KeyChord[] {
  if (isWallAction(id)) return overrides[id] ?? defaultKeys(id);
  return BUILTIN.get(id) ?? [];
}

/** The keys that run a command now: the person's binding for a Wall action, else the keymap's. */
export function effectiveKeys(id: string): readonly KeyChord[] {
  return keysIn(useKeyBindings.getState().overrides, id);
}

/** Whether the person changed this action's keys. */
export function isCustomised(id: WallActionId): boolean {
  return useKeyBindings.getState().overrides[id] !== undefined;
}

/** The action or reserved command that holds the chord, `except` aside, under the given bindings. */
function holder(overrides: BindingOverrides, chord: KeyChord, except: string | null): string | null {
  const wanted = slot(chord);
  for (const action of WALL_ACTIONS) {
    if (action.id !== except && keysIn(overrides, action.id).some((c) => slot(c) === wanted)) return action.id;
  }
  for (const id of RESERVED_ON_THE_WALL) if (keysIn(overrides, id).some((c) => slot(c) === wanted)) return id;
  return null;
}

/** The first two actions a set of bindings gives one chord, or null when every chord has one action. */
function firstConflict(overrides: BindingOverrides): { first: string; second: string; chord: KeyChord } | null {
  for (const action of WALL_ACTIONS) {
    for (const chord of keysIn(overrides, action.id)) {
      const other = holder(overrides, chord, action.id);
      if (other) return { first: action.id, second: other, chord };
    }
  }
  return null;
}

/** Keys that move focus between controls, or are not a key on their own. */
function reserved(chord: KeyChord): boolean {
  return ['tab', 'shift', 'control', 'alt', 'meta', 'altgraph', 'dead', 'unidentified'].includes(chord.key);
}

export type RebindOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'conflict'; readonly holder: string }
  | { readonly ok: false; readonly reason: 'reserved' };

/** Give the action this one chord in place of its keys, unless another action or the Wall holds it. */
export function rebindAction(id: WallActionId, chord: KeyChord): RebindOutcome {
  if (reserved(chord)) return { ok: false, reason: 'reserved' };
  const overrides = useKeyBindings.getState().overrides;
  const other = holder(overrides, chord, id);
  if (other) return { ok: false, reason: 'conflict', holder: other };
  commit({ ...overrides, [id]: [cleanChord(chord) ?? chord] });
  return { ok: true };
}

/** Leave the action without a key (its button and the palette still run it). */
export function unbindAction(id: WallActionId): void {
  commit({ ...useKeyBindings.getState().overrides, [id]: [] });
}

/**
 * Put the action back on its default keys. Refused when the person has since
 * given one of those keys to another action: the holder is named instead.
 */
export function resetAction(id: WallActionId): RebindOutcome {
  const rest: Partial<Record<WallActionId, readonly KeyChord[]>> = { ...useKeyBindings.getState().overrides };
  delete rest[id];
  for (const chord of defaultKeys(id)) {
    const other = holder(rest, chord, id);
    if (other) return { ok: false, reason: 'conflict', holder: other };
  }
  commit(rest);
  return { ok: true };
}

export function resetAllBindings(): void {
  commit({});
}

/** The person's set as a file's text: only what differs from the defaults. */
export function exportKeyBindings(): string {
  return serialise(useKeyBindings.getState().overrides);
}

export type ImportOutcome =
  | { readonly ok: true; readonly applied: number; readonly skipped: number }
  | { readonly ok: false; readonly reason: 'invalid' }
  | { readonly ok: false; readonly reason: 'conflict'; readonly first: string; readonly second: string; readonly chord: KeyChord };

/** Replace the person's set with a file's. A file that is not a set, or that gives one key two actions, changes nothing. */
export function importKeyBindings(text: string): ImportOutcome {
  const parsed = parse(text);
  if (!parsed) return { ok: false, reason: 'invalid' };
  const conflict = firstConflict(parsed.overrides);
  if (conflict) return { ok: false, reason: 'conflict', ...conflict };
  commit(parsed.overrides);
  return { ok: true, applied: Object.keys(parsed.overrides).length, skipped: parsed.skipped };
}
