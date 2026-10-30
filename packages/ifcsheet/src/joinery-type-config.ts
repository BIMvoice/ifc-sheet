/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The opening configuration of a door or window TYPE (#448): how many leaves it has (1 to 3), how each one opens, and whether a fixed
 * fanlight sits over them. For models from other tools, whose types carry only an overall size.
 *
 * It is not a store of its own. Configuring a type writes one entry of the project's joinery catalogue (`JoinerySpec`: columns are the
 * leaves, the panels carry the operations) and maps the type's GlobalId to it (`JoineryMapping.types`), so everything that already
 * reads the catalogue and the mapping follows: the joinery schedule's elevation, the plan symbol, the project file, the headless check.
 * The overall size is the IFC's: `fitToElement` resizes the entry to each element it draws, so the entry's own width and height are
 * only the size of the element it was configured from.
 *
 * Pure, and here so the web app and the headless engine configure a type the same way.
 */

import {
  defaultDoorSpec, defaultWindowSpec,
  type JoineryCustomProp, type JoineryHead, type JoineryKind, type JoinerySpec, type PanelOperation,
} from '@ifc-lite/create';
import { cleanCustomProps } from './joinery-custom-props.js';
import { TYPE_ENTRY_PREFIX, type JoineryMapping } from './joinery-mapping.js';

export const MAX_LEAVES = 3;

/** The fanlight's share of the opening's height. */
export const FANLIGHT_SHARE = 0.25;

export interface TypeOpening {
  /** One operation per leaf, left to right as seen from the interior; 1 to `MAX_LEAVES` of them. */
  operations: PanelOperation[];
  /** A fixed light over all the leaves. */
  fanlight: boolean;
}

const WINDOW_LEAF: readonly PanelOperation[] = ['fixed', 'side-left', 'side-right', 'tilt-turn-left', 'tilt-turn-right', 'top-hung', 'bottom-hung', 'sliding-left', 'sliding-right'];
const DOOR_LEAF: readonly PanelOperation[] = ['fixed', 'swing-left', 'swing-right', 'door-sliding-left', 'door-sliding-right'];

/** What a leaf of `kind` can do: fixed, the hinged and sliding kinds (a window also tilts). */
export function leafOperations(kind: JoineryKind): readonly PanelOperation[] {
  return kind === 'door' ? DOOR_LEAF : WINDOW_LEAF;
}

/** `opening` made valid for `kind`: 1 to 3 leaves, each an operation `kind` offers (an unknown one is fixed). */
export function cleanOpening(kind: JoineryKind, opening: TypeOpening): TypeOpening {
  const allowed = new Set<PanelOperation>(leafOperations(kind));
  const operations = opening.operations.slice(0, MAX_LEAVES).map((o) => (allowed.has(o) ? o : 'fixed' as const));
  return { operations: operations.length ? operations : ['fixed'], fanlight: opening.fanlight === true };
}

/** The catalogue entry for `opening` at `size` (metres, the IFC's overall size), on the kind's default frame and sash. */
export function specFromOpening(kind: JoineryKind, size: { width: number; height: number }, opening: TypeOpening, base?: Partial<Pick<JoinerySpec, 'id' | 'name' | 'mark'>>): JoinerySpec {
  const clean = cleanOpening(kind, opening);
  const d = kind === 'door' ? defaultDoorSpec() : defaultWindowSpec();
  const leaves = clean.operations.length;
  return {
    ...d,
    ...base,
    kind,
    width: size.width, height: size.height,
    columns: Array.from({ length: leaves }, () => 1),
    // Rows run bottom to top: the leaves, then the fanlight.
    rows: clean.fanlight ? [1 - FANLIGHT_SHARE, FANLIGHT_SHARE] : [1],
    panels: [
      ...clean.operations.map((operation, col) => ({ col, row: 0, operation })),
      ...(clean.fanlight ? [{ col: 0, row: 1, colSpan: leaves, operation: 'fixed' as const }] : []),
    ],
    // The IFC gives no thermal value, and the defaults' is not the model's: a type configured from its size claims none.
    props: { isExternal: d.props.isExternal },
  };
}

/** The opening a catalogue entry has, or null for an entry that is not of this shape (more than 3 leaves, several rows of leaves, a panel spanning leaves). */
export function openingOfSpec(spec: JoinerySpec): TypeOpening | null {
  const leaves = spec.columns.length;
  if (leaves < 1 || leaves > MAX_LEAVES || spec.rows.length > 2) return null;
  const fanlight = spec.rows.length === 2;
  const operations: PanelOperation[] = [];
  for (let col = 0; col < leaves; col++) {
    const p = spec.panels.find((x) => x.col === col && x.row === 0 && (x.colSpan ?? 1) === 1 && (x.rowSpan ?? 1) === 1);
    if (!p) return null;
    operations.push(p.operation);
  }
  return { operations, fanlight };
}

/** The id of the entry configured for a type: the type's GlobalId, so configuring it again edits the same entry. */
/**
 * The sill typed in for a window type entry, metres, or null when none was stated (the entry then holds the kind's default, which the
 * model never gave and nothing prints). Typed is what `sillTyped` says; an entry saved before the flag existed is typed when its sill
 * differs from the default, since those were the only ones a user could have set.
 */
export function typedSillOf(entry: Pick<JoinerySpec, 'kind' | 'sillHeight' | 'sillTyped'>): number | null {
  if (entry.kind !== 'window') return null;
  return entry.sillTyped === true || Math.abs(entry.sillHeight - defaultWindowSpec().sillHeight) >= 1e-9 ? entry.sillHeight : null;
}

export const typeEntryId = (typeGlobalId: string): string => `${TYPE_ENTRY_PREFIX}${typeGlobalId}`;

export interface ConfigureTypeInput {
  typeGlobalId: string;
  kind: JoineryKind;
  /** The type's name, for the entry. */
  name: string;
  /** The IFC's overall size, metres. */
  size: { width: number; height: number };
  opening: TypeOpening;
  /** The head's shape. Absent: the type keeps the one it has (square for a type configured now). */
  head?: JoineryHead;
  /** The window's sill height, metres (the IFC states none). Absent: the type keeps the one it has; `null`: not stated (the default, unprinted). Ignored for a door. */
  sillHeight?: number | null;
  /** The properties typed in for the type. Absent: the type keeps its own; an empty list removes them. */
  custom?: readonly JoineryCustomProp[];
}

/** `head` made valid: square is no head (undefined); a rise only where the shape takes one, and a positive one. */
export function cleanHead(head: JoineryHead | undefined): JoineryHead | undefined {
  if (!head || head.shape === 'square') return undefined;
  if (head.shape === 'round') return { shape: 'round' };
  return head.rise !== undefined && Number.isFinite(head.rise) && head.rise > 0 ? { shape: head.shape, rise: head.rise } : { shape: head.shape };
}

export interface ProjectJoinery {
  joineryTypes: readonly JoinerySpec[];
  joineryMapping: JoineryMapping;
}

function nextMark(kind: JoineryKind, list: readonly JoinerySpec[]): string {
  const prefix = kind === 'door' ? 'D' : 'W';
  const used = new Set(list.map((t) => t.mark));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/**
 * The project's catalogue and mapping with the type configured: its entry added (or, when the type was configured before, its leaves,
 * divisions and size replaced, keeping its mark, name and whatever the user edited besides) and the type mapped to it. Every element
 * of the type is then drawn with it, unless an element has a choice of its own. The inputs are not changed.
 */
export function configureTypeOpening(project: ProjectJoinery, input: ConfigureTypeInput): { joineryTypes: JoinerySpec[]; joineryMapping: JoineryMapping; entryId: string } {
  const id = typeEntryId(input.typeGlobalId);
  const list = [...project.joineryTypes];
  const at = list.findIndex((e) => e.id === id && e.kind === input.kind);
  const previous = at >= 0 ? list[at] : null;
  const fresh = specFromOpening(input.kind, input.size, input.opening, { id, name: input.name || (input.kind === 'door' ? 'Door' : 'Window'), mark: previous?.mark ?? nextMark(input.kind, list) });
  const base: JoinerySpec = previous
    ? { ...previous, width: fresh.width, height: fresh.height, columns: fresh.columns, rows: fresh.rows, panels: fresh.panels }
    : fresh;
  // Head and custom properties: what the input says, else what the entry had; none is no field at all.
  const head = input.head !== undefined ? cleanHead(input.head) : base.head;
  const custom = input.custom ? cleanCustomProps(input.custom) : base.custom;
  const { head: _h, custom: _c, ...rest } = base;
  const { sillTyped: _s, ...restNoSill } = rest;
  const given = input.sillHeight;
  const typedNow = input.kind === 'window' && typeof given === 'number' && Number.isFinite(given) && given >= 0;
  const cleared = input.kind === 'window' && given === null;
  const keepsTyped = !typedNow && !cleared && typedSillOf(base) !== null;
  const sill = typedNow ? given : cleared ? defaultWindowSpec().sillHeight : base.sillHeight;
  const entry: JoinerySpec = { ...restNoSill, sillHeight: sill, ...(typedNow || keepsTyped ? { sillTyped: true as const } : {}), ...(head ? { head } : {}), ...(custom?.length ? { custom } : {}) };
  if (at >= 0) list[at] = entry;
  else list.push(entry);
  return {
    joineryTypes: list,
    joineryMapping: { ...project.joineryMapping, types: { ...project.joineryMapping.types, [input.typeGlobalId]: id } },
    entryId: id,
  };
}
