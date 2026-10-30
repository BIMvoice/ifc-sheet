/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The opening configuration of a door or window TYPE (#448): how many leaves it has (1 to 6), how each one opens, whether a second row
 * (a transom) sits over them, fixed or opening, and the glazing bars dividing each pane. For models from other tools, whose types carry only an overall size.
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
  type JoineryCustomProp, type JoineryGlazingBars, type JoineryHead, type JoineryKind, type JoinerySpec, type PanelOperation,
} from '@ifc-lite/create';
import { cleanCustomProps } from './joinery-custom-props.js';
import { TYPE_ENTRY_PREFIX, type JoineryMapping } from './joinery-mapping.js';

export const MAX_LEAVES = 6;

/** The most glazing bars across, and up and down, a pane. */
export const MAX_BARS = 5;

/** The fanlight's share of the opening's height. */
export const FANLIGHT_SHARE = 0.25;

export interface TypeOpening {
  /** One operation per leaf, left to right as seen from the interior; 1 to `MAX_LEAVES` of them. */
  operations: PanelOperation[];
  /** A second row, the transom, over all the leaves: fixed, one light across, unless `fanlightOpens`. */
  fanlight: boolean;
  /** A window's transom row opens: one top-hung light over each leaf (the common practice for a row of opening lights). Absent: fixed. */
  fanlightOpens?: true;
  /** Glazing bars dividing the glass of every pane in elevation. Absent: none. */
  bars?: JoineryGlazingBars;
}

/** `bars` made valid: whole counts of 0 to `MAX_BARS`; none at all is no bars (undefined). */
export function cleanBars(bars: JoineryGlazingBars | undefined): JoineryGlazingBars | undefined {
  if (!bars) return undefined;
  const count = (n: number) => (Number.isFinite(n) ? Math.min(MAX_BARS, Math.max(0, Math.round(n))) : 0);
  const horizontal = count(bars.horizontal), vertical = count(bars.vertical);
  return horizontal || vertical ? { horizontal, vertical } : undefined;
}

const WINDOW_LEAF: readonly PanelOperation[] = ['fixed', 'side-left', 'side-right', 'tilt-turn-left', 'tilt-turn-right', 'top-hung', 'bottom-hung', 'sliding-left', 'sliding-right'];
const DOOR_LEAF: readonly PanelOperation[] = ['fixed', 'swing-left', 'swing-right', 'door-sliding-left', 'door-sliding-right'];

/** What a leaf of `kind` can do: fixed, the hinged and sliding kinds (a window also tilts). */
export function leafOperations(kind: JoineryKind): readonly PanelOperation[] {
  return kind === 'door' ? DOOR_LEAF : WINDOW_LEAF;
}

/** `opening` made valid for `kind`: 1 to `MAX_LEAVES` leaves, each an operation `kind` offers (an unknown one is fixed). */
export function cleanOpening(kind: JoineryKind, opening: TypeOpening): TypeOpening {
  const allowed = new Set<PanelOperation>(leafOperations(kind));
  const operations = opening.operations.slice(0, MAX_LEAVES).map((o) => (allowed.has(o) ? o : 'fixed' as const));
  const fanlight = opening.fanlight === true;
  const bars = cleanBars(opening.bars);
  return {
    operations: operations.length ? operations : ['fixed'], fanlight,
    // Only a window has a top-hung light to put in the transom row.
    ...(fanlight && kind === 'window' && opening.fanlightOpens === true ? { fanlightOpens: true as const } : {}),
    ...(bars ? { bars } : {}),
  };
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
    // Rows run bottom to top: the leaves, then the transom row.
    rows: clean.fanlight ? [1 - FANLIGHT_SHARE, FANLIGHT_SHARE] : [1],
    panels: [
      ...clean.operations.map((operation, col) => ({ col, row: 0, operation })),
      ...(clean.fanlight && clean.fanlightOpens
        ? Array.from({ length: leaves }, (_, col) => ({ col, row: 1, operation: 'top-hung' as const }))
        : clean.fanlight ? [{ col: 0, row: 1, colSpan: leaves, operation: 'fixed' as const }] : []),
    ],
    ...(clean.bars ? { glazingBars: clean.bars } : {}),
    // The IFC gives no thermal value, and the defaults' is not the model's: a type configured from its size claims none.
    props: { isExternal: d.props.isExternal },
  };
}

/** The opening a catalogue entry has, or null for an entry that is not of this shape (more than `MAX_LEAVES` leaves, more than two rows, a panel spanning leaves). */
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
  // The transom row opens when it is one top-hung light over each leaf; any other second row reads as a fixed one.
  const upper = spec.panels.filter((x) => x.row === 1);
  const opens = fanlight && upper.length === leaves && upper.every((x) => x.operation === 'top-hung' && (x.colSpan ?? 1) === 1 && (x.rowSpan ?? 1) === 1)
    && upper.every((x) => x.col >= 0 && x.col < leaves) && new Set(upper.map((x) => x.col)).size === leaves;
  const bars = cleanBars(spec.glazingBars);
  return { operations, fanlight, ...(opens ? { fanlightOpens: true as const } : {}), ...(bars ? { bars } : {}) };
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

/** The entry without its glazing bars: the configuration sets them afresh, so an opening without any clears them. */
function kept(entry: JoinerySpec): Omit<JoinerySpec, 'glazingBars'> {
  const { glazingBars: _g, ...rest } = entry;
  return rest;
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
    ? { ...kept(previous), width: fresh.width, height: fresh.height, columns: fresh.columns, rows: fresh.rows, panels: fresh.panels, ...(fresh.glazingBars ? { glazingBars: fresh.glazingBars } : {}) }
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
