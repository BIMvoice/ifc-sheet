/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view coloured by a property (#92): function, fire compartment, finish or
 * phase plans. The view stores WHAT to colour (`ColourScheme`: a property,
 * rooms or elements, the colours the user set by hand, a palette); which
 * value gets which colour is computed here, the one place, so the app's
 * screen, its sheets, its PDF and DXF and the headless engine cannot differ.
 *
 * Assignment is stable. A value's colour comes from the value itself (a hash
 * of its normalised text picks the palette slot), never from the order the
 * model lists elements in, and values are settled in a fixed order, so the
 * same value has the same colour in every view and after a model update. Two
 * values that want one slot do not share it: the one that sorts first keeps
 * it and the other takes the next free slot. Pure: no model, no screen.
 */

/** Where a scheme paints: the rooms (IfcSpace) of a plan, or the cut faces of elements. */
export const SCHEME_TARGETS = ['rooms', 'elements'] as const;
export type SchemeTarget = (typeof SCHEME_TARGETS)[number];

/** Built-in palettes, both safe for the common colour-blindnesses. */
export const PALETTE_IDS = ['tol-light', 'okabe-ito'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const DEFAULT_PALETTE: PaletteId = 'tol-light';

/**
 * Paul Tol's "light" qualitative scheme (made for fills under dark ink: nine
 * colours, distinguishable in the common colour vision deficiencies) and the
 * Okabe-Ito set without its black (seven hues).
 */
export const PALETTES: Record<PaletteId, readonly string[]> = {
  'tol-light': ['#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD'],
  'okabe-ito': ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
};

/** How a view is coloured by a property. Absent on a view that is not. */
export interface ColourScheme {
  /** What is read: `Pset.Property` (`Type.Pset.Property` for the element's type), or an attribute such as `LongName` or `ObjectType`. */
  property: string;
  target: SchemeTarget;
  /** `elements` only: the IFC classes painted (any case). Absent or empty: every class. */
  classes?: string[];
  /** Colours set by hand: value key (`valueKey`) to `#rrggbb`. They win over the palette. */
  colours?: Record<string, string>;
  /** Absent: {@link DEFAULT_PALETTE}. */
  palette?: PaletteId;
}

export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** A scheme read from a project file; anything malformed is dropped, a scheme with no property or target is no scheme. */
export function readColourScheme(raw: unknown): ColourScheme | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.property !== 'string' || !r.property.trim() || r.property.length > 300) return undefined;
  if (!SCHEME_TARGETS.some((t) => t === r.target)) return undefined;
  const out: ColourScheme = { property: r.property.trim(), target: r.target as SchemeTarget };
  if (Array.isArray(r.classes)) {
    const classes = [...new Set(r.classes.filter((c): c is string => typeof c === 'string' && c.trim() !== '').map((c) => c.trim()))];
    if (classes.length > 0) out.classes = classes;
  }
  if (typeof r.colours === 'object' && r.colours !== null && !Array.isArray(r.colours)) {
    const colours: Record<string, string> = {};
    for (const [key, value] of Object.entries(r.colours)) if (typeof value === 'string' && HEX_COLOUR.test(value)) colours[key] = value.toLowerCase();
    if (Object.keys(colours).length > 0) out.colours = colours;
  }
  const palette = PALETTE_IDS.find((p) => p === r.palette);
  if (palette && palette !== DEFAULT_PALETTE) out.palette = palette;
  return out;
}

/** The text a property value reads as, or `null` when it says nothing (absent, empty, not a value). */
export function valueText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    const parts = value.map(valueText).filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof value === 'object' && value !== null && 'value' in value) return valueText((value as { value: unknown }).value);
  return null;
}

/** What two spellings of one value share: trimmed, composed, without case. */
export const valueKey = (text: string): string => text.trim().normalize('NFC').toLowerCase();

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The order values are settled and listed in: natural order in a fixed locale, then by code point, so it is the same on every machine. */
export function compareKeys(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** FNV-1a over UTF-16 code units: a value's preferred slot. */
function hashOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16);

/** `hex` mixed with white by `share` (0..1). */
function lighter(hex: string, share: number): string {
  const mix = (at: number) => Math.round(channel(hex, at) + (255 - channel(hex, at)) * share).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** How many shades of the palette there are: the palette itself and two paler rounds of it. */
const ROUNDS = 3;

/** The colour of slot `slot`; past the palette the same colours come round again, paler (a model with more values than colours: edit them); `round` is below ROUNDS. */
function slotColour(palette: readonly string[], slot: number): string {
  const round = Math.floor(slot / palette.length);
  const base = palette[slot % palette.length];
  return round === 0 ? base : lighter(base, 0.3 * round);
}

/**
 * The colour of each value in `keys` (value keys): the scheme's hand-set colour where it has one, else the palette slot
 * the value's hash picks, probing on to the next free slot in sorted order when another value of the set already has it.
 * The result does not depend on the order of `keys`.
 */
export function assignColours(keys: Iterable<string>, scheme: Pick<ColourScheme, 'colours' | 'palette'>): Map<string, string> {
  const palette = PALETTES[scheme.palette ?? DEFAULT_PALETTE];
  const sorted = [...new Set(keys)].sort(compareKeys);
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const hand = (key: string): string | undefined => {
    const c = scheme.colours?.[key];
    return c && HEX_COLOUR.test(c) ? c.toLowerCase() : undefined;
  };
  for (const key of sorted) {
    const colour = hand(key);
    if (colour) {
      out.set(key, colour);
      taken.add(colour);
    }
  }
  for (const key of sorted) {
    if (out.has(key)) continue;
    const home = hashOf(key) % palette.length;
    // The slot the hash picks; if a value of the set wears its colour, the next slot round the palette; once the palette is full, the same again a shade paler.
    let colour = '';
    for (let round = 0; round < ROUNDS && !colour; round++) {
      for (let k = 0; k < palette.length && !colour; k++) {
        const candidate = slotColour(palette, round * palette.length + ((home + k) % palette.length)).toLowerCase();
        if (!taken.has(candidate)) colour = candidate;
      }
    }
    // Every shade of every colour is worn (more than ROUNDS * palette values): colours come round again.
    if (!colour) colour = slotColour(palette, out.size % (ROUNDS * palette.length)).toLowerCase();
    out.set(key, colour);
    taken.add(colour);
  }
  return out;
}

/** One value a view shows: what the legend lists. */
export interface SchemeEntry {
  key: string;
  /** The value as written (the first spelling in sort order when two differ only in case). */
  label: string;
  colour: string;
  /** How many rooms or elements of the view carry it. */
  count: number;
}

/**
 * The entries of the values `found` (value text → element ids carrying it) with their colours, in the settled order. Only values in
 * `found` are listed: the scheme's stored colours for values the view does not show are not.
 */
export function schemeEntries(found: ReadonlyMap<string, { label: string; ids: ReadonlySet<number> }>, scheme: Pick<ColourScheme, 'colours' | 'palette'>): SchemeEntry[] {
  const colours = assignColours(found.keys(), scheme);
  return [...found.keys()].sort(compareKeys).map((key) => {
    const at = found.get(key)!;
    return { key, label: at.label, colour: colours.get(key)!, count: at.ids.size };
  });
}

/** A property path as a short title for a legend: the property's own name (`Pset_SpaceCommon.Category` → `Category`). */
export function schemeTitle(property: string): string {
  const parts = property.split('.');
  return parts[parts.length - 1]?.trim() || property;
}
