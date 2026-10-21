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
 * viewer keeps live on the Wall (its global keys: the palette, the theme,
 * Delete...) already has the combination, or when the key moves focus between
 * controls (Tab): a keyboard user must always be able to leave. A file or
 * storage is held to the same rules, and to a size: at most
 * {@link MAX_CHORDS_PER_ACTION} keys per action, in a file of at most
 * {@link IMPORT_MAX_CHARS} characters.
 */

import { create } from 'zustand';
import { WALL_ACTIONS, defaultKeys, isWallAction, type WallActionId } from './action-registry';
import type { KeyChord } from './chord';
import { KEY_COMMANDS } from './keyboard-commands';

/** The person's bindings, by action id: an empty list is an action they left without a key. */
export type BindingOverrides = Readonly<Partial<Record<WallActionId, readonly KeyChord[]>>>;

export const KEY_BINDINGS_STORAGE_KEY = 'ifcsheet:key-bindings';
const FILE_FORMAT = 'ifcsheet-keyboard';
const FILE_VERSION = 1;
const BUILTIN: ReadonlyMap<string, readonly KeyChord[]> = new Map(KEY_COMMANDS.map((c) => [c.id, c.keys]));
/** Keys per action a file or storage may carry. */
export const MAX_CHORDS_PER_ACTION = 4;
/** The longest keyboard file taken, in characters: a real set is a few KB. */
export const IMPORT_MAX_CHARS = 256 * 1024;
/**
 * The viewer's own keys that stay live on the Wall (`ViewerLayout` keeps its global
 * shortcuts mounted, and a menu or dialog keeps its keys): a Wall action given one
 * of these would run beside the viewer's action on one press.
 */
const LIVE_ON_THE_WALL: readonly string[] = KEY_COMMANDS.filter((c) => c.when === 'global' || c.when === 'overlay').map((c) => c.id);

/** The physical key a chord names, so `Alt+code:Digit1` and an `Alt+1` written by hand are the same slot. */
function slot(chord: KeyChord): string {
  const key = chord.key.startsWith('code:Digit') ? chord.key.slice('code:Digit'.length)
    : /^code:Key[A-Z]$/.test(chord.key) ? chord.key.slice('code:Key'.length).toLowerCase() : chord.key;
  // A shifted symbol carries the shift in the character itself (`?`), as the dispatcher reads it.
  const shifted = chord.shift && !(key.length === 1 && key.toLowerCase() === key.toUpperCase() && !/\d/.test(key));
  return [chord.mod ? 'mod' : '', chord.alt ? 'alt' : '', shifted ? 'shift' : '', chord.double ? 'double' : '', key].join('|');
}

/** A chord as a file or storage may carry it: a key name (lower case, as the dispatcher compares) and the three modifiers, nothing else. */
function shapeChord(raw: unknown): KeyChord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== 'string' || r.key.length === 0 || r.key.length > 32) return null;
  for (const flag of ['mod', 'alt', 'shift'] as const) if (r[flag] !== undefined && r[flag] !== true) return null;
  // A position (`code:KeyS`) keeps its case: it is compared with `KeyboardEvent.code`.
  const key = r.key.startsWith('code:') ? r.key : r.key.toLowerCase();
  return { key, ...(r.mod ? { mod: true as const } : {}), ...(r.alt ? { alt: true as const } : {}), ...(r.shift ? { shift: true as const } : {}) };
}

/** A chord a binding may be: well formed, and not a key that moves focus. */
function cleanChord(raw: unknown): KeyChord | null {
  const chord = shapeChord(raw);
  return chord && !reserved(chord) ? chord : null;
}

type ParseResult =
  | { readonly ok: true; readonly overrides: BindingOverrides; readonly skipped: number }
  | { readonly ok: false; readonly reason: 'invalid' }
  | { readonly ok: false; readonly reason: 'reserved'; readonly chord: KeyChord }
  | { readonly ok: false; readonly reason: 'tooMany'; readonly action: WallActionId; readonly max: number };

const INVALID = { ok: false, reason: 'invalid' } as const;

/** The bindings a stored or imported text holds, or why it is not a keyboard set. Ids this Wall does not have are counted and left out. */
function parse(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return INVALID;
  }
  if (typeof data !== 'object' || data === null) return INVALID;
  const d = data as Record<string, unknown>;
  if (d.format !== FILE_FORMAT || d.version !== FILE_VERSION || typeof d.bindings !== 'object' || d.bindings === null) return INVALID;
  const overrides: Partial<Record<WallActionId, readonly KeyChord[]>> = {};
  let skipped = 0;
  for (const [id, chords] of Object.entries(d.bindings as Record<string, unknown>)) {
    if (!isWallAction(id)) { skipped += 1; continue; }
    if (!Array.isArray(chords)) return INVALID;
    // Before any chord is read: a file of hundreds of thousands of them must not be walked.
    if (chords.length > MAX_CHORDS_PER_ACTION) return { ok: false, reason: 'tooMany', action: id, max: MAX_CHORDS_PER_ACTION };
    const shaped = chords.map(shapeChord);
    if (shaped.some((c) => c === null)) return INVALID;
    const refused = (shaped as KeyChord[]).find(reserved);
    if (refused) return { ok: false, reason: 'reserved', chord: refused };
    overrides[id] = shaped as KeyChord[];
  }
  return { ok: true, overrides, skipped };
}

function serialise(overrides: BindingOverrides): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, bindings: overrides }, null, 2);
}

interface Stored { overrides: BindingOverrides; dropped: number }

/**
 * The saved set. A binding that now collides (written by an older build, a new
 * default, edited by hand) is dropped on its own and counted; the rest holds.
 */
function stored(): Stored {
  try {
    const text = globalThis.localStorage?.getItem(KEY_BINDINGS_STORAGE_KEY);
    const parsed = text ? parse(text) : null;
    return parsed?.ok ? withoutConflicts(parsed.overrides) : { overrides: {}, dropped: 0 };
  } catch {
    return { overrides: {}, dropped: 0 };
  }
}

/** The set with each chord that collides taken out (an action left with none goes back to its default), and how many were. */
function withoutConflicts(overrides: BindingOverrides): Stored {
  let current: Partial<Record<WallActionId, readonly KeyChord[]>> = { ...overrides };
  let dropped = 0;
  for (let conflict = firstConflict(current); conflict; conflict = firstConflict(current)) {
    const left = (current[conflict.first] ?? []).filter((c) => slot(c) !== slot(conflict.chord));
    if (left.length > 0) current = { ...current, [conflict.first]: left };
    else { current = { ...current }; delete current[conflict.first]; }
    dropped += 1;
  }
  return { overrides: current, dropped };
}

/** Stored bindings dropped at load for colliding, as the one-time count: asking resets it, so a person is told once. */
export function takeDroppedBindings(): number {
  const { dropped } = useKeyBindings.getState();
  if (dropped > 0) useKeyBindings.setState({ dropped: 0 });
  return dropped;
}

export const useKeyBindings = create<Stored>()(() => stored());

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
  useKeyBindings.setState(stored());
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

/**
 * The action or viewer command that holds the chord, `except` aside, under the given bindings.
 * A key some Wall action ships with is not refused for a viewer key that shares it (Alt+1 opens a
 * panel, Delete deletes a selection): the Wall's handler comes first and takes the press, as it
 * always has.
 */
function holder(overrides: BindingOverrides, chord: KeyChord, except: string | null): string | null {
  const wanted = slot(chord);
  for (const action of WALL_ACTIONS) {
    if (action.id !== except && keysIn(overrides, action.id).some((c) => slot(c) === wanted)) return action.id;
  }
  if (WALL_ACTIONS.some((a) => defaultKeys(a.id).some((c) => slot(c) === wanted))) return null;
  for (const id of LIVE_ON_THE_WALL) if (keysIn(overrides, id).some((c) => slot(c) === wanted)) return id;
  return null;
}

/** The first two actions a set of bindings gives one chord, or null when every chord has one action. Only what the person bound is checked: the defaults ship as they are. */
function firstConflict(overrides: BindingOverrides): { first: WallActionId; second: string; chord: KeyChord } | null {
  for (const action of WALL_ACTIONS) {
    if (overrides[action.id] === undefined) continue;
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
  const clean = cleanChord(chord);
  if (!clean) return { ok: false, reason: 'reserved' };
  const overrides = useKeyBindings.getState().overrides;
  const other = holder(overrides, clean, id);
  if (other) return { ok: false, reason: 'conflict', holder: other };
  commit({ ...overrides, [id]: [clean] });
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
  | { readonly ok: false; readonly reason: 'invalid' | 'tooLarge' }
  | { readonly ok: false; readonly reason: 'reserved'; readonly chord: KeyChord }
  | { readonly ok: false; readonly reason: 'tooMany'; readonly action: WallActionId; readonly max: number }
  | { readonly ok: false; readonly reason: 'conflict'; readonly first: string; readonly second: string; readonly chord: KeyChord };

/** Replace the person's set with a file's. A file that is not a set, is too big, or gives one key two actions, changes nothing. */
export function importKeyBindings(text: string): ImportOutcome {
  if (text.length > IMPORT_MAX_CHARS) return { ok: false, reason: 'tooLarge' };
  const parsed = parse(text);
  if (!parsed.ok) return parsed;
  const conflict = firstConflict(parsed.overrides);
  if (conflict) return { ok: false, reason: 'conflict', ...conflict };
  commit(parsed.overrides);
  return { ok: true, applied: Object.keys(parsed.overrides).length, skipped: parsed.skipped };
}
