/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Phases, for renovation drawings (survey, demolition, proposed): every
 * element is EXISTING, to be demolished, NEW or temporary, and a view draws
 * each phase in its own style and shows only the phases it is asked to.
 *
 * The phase comes from the IFC `Status` of the element's `Pset_*Common`
 * (IFC4 enumeration NEW, EXISTING, DEMOLISH, TEMPORARY, OTHER, NOTKNOWN,
 * UNSET; the same property in IFC2X3 files), read on the element and, when
 * it has none, on its type. A project can instead map a property of its own
 * (a set, a property and a value → phase table), which wins where it has a
 * value. An element with no phase counts as EXISTING (`PhaseSource.unmarked`
 * changes that). Pure: the element comes in through `PhaseReader`
 * (`labels/label-resolve.ts`'s sets), the styles through `ViewGraphics`.
 */

import type { PropertySetLike } from '@/labels/label-resolve';
import type { CategoryLineWeight, PhaseId, PhaseStyle, ViewGraphics, ViewPhases } from './types';

export const PHASES = ['existing', 'demolish', 'new', 'temporary'] as const satisfies readonly PhaseId[];

/** The phase names of the interface (catalogue keys `phase.<id>`). */
export const PHASE_LABEL_KEYS: Record<PhaseId, string> = {
  existing: 'phase.existing', demolish: 'phase.demolish', new: 'phase.new', temporary: 'phase.temporary',
};

/**
 * The default look, black and white: existing is thin grey, to demolish is
 * dashed, new is heavy black. Edit a view's `graphics.phases.styles` for colour sets.
 */
export const DEFAULT_PHASE_STYLES: Record<PhaseId, PhaseStyle> = {
  existing: { lineColor: '#808080', lineWeight: 'light', dashed: false, fillColor: '#e4e4e7' },
  demolish: { lineColor: '#000000', lineWeight: 'medium', dashed: true, fillColor: '#ffffff' },
  new: { lineColor: '#000000', lineWeight: 'heavy', dashed: false, fillColor: '#52525b' },
  temporary: { lineColor: '#808080', lineWeight: 'light', dashed: true, fillColor: '#ffffff' },
};

/** The phases a kind of drawing shows, to start a view from. */
export const PHASE_VIEW_PRESETS = {
  survey: ['existing', 'demolish'],
  demolition: ['existing', 'demolish'],
  proposed: ['existing', 'new'],
} as const satisfies Record<string, readonly PhaseId[]>;

/**
 * A view's phases started from a preset, keeping its style edits. A survey records the building as it
 * stands, so what is to be demolished draws as plain existing there; the demolition plan marks it.
 */
export function phasesFromPreset(preset: keyof typeof PHASE_VIEW_PRESETS, current?: ViewPhases): ViewPhases {
  const { demolishAsExisting: _, ...rest } = current ?? { show: [] };
  return { ...rest, show: [...PHASE_VIEW_PRESETS[preset]], ...(preset === 'survey' ? { demolishAsExisting: true } : {}) };
}

/** The phase an element of `phase` is drawn with in a view: to demolish draws as existing where the view says so. */
export const drawnPhase = (phase: PhaseId, phases: Pick<ViewPhases, 'demolishAsExisting'> | undefined): PhaseId =>
  phase === 'demolish' && phases?.demolishAsExisting ? 'existing' : phase;

/** A property of the project's own that says the phase, and what each of its values means. */
export interface PhaseMapping {
  set: string;
  property: string;
  /** Property value (compared without case) → phase. */
  values: Record<string, PhaseId>;
}

export interface PhaseSource {
  mapping?: PhaseMapping;
  /** The phase of an element that says none. Absent: EXISTING. */
  unmarked?: PhaseId;
}

/** What a phase is read from: the element's and its type's property sets. */
export interface PhaseReader {
  propertySets(): PropertySetLike[];
  typePropertySets(): PropertySetLike[];
}

const STATUS_PHASE: Record<string, PhaseId> = { NEW: 'new', EXISTING: 'existing', DEMOLISH: 'demolish', TEMPORARY: 'temporary' };

/** The phase an IFC `Status` names; OTHER, NOTKNOWN, UNSET and anything else name none. */
export function phaseOfStatus(value: unknown): PhaseId | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  return STATUS_PHASE[first.trim().replace(/^\.|\.$/g, '').toUpperCase()] ?? null;
}

const sameName = (a: string, b: string): boolean => a === b || a.toLowerCase() === b.toLowerCase();
const COMMON_SET = /^Pset_.*Common$/i;

function read(sets: readonly PropertySetLike[], wanted: (setName: string) => boolean, property: string): unknown[] {
  return sets.filter((s) => wanted(s.name)).flatMap((s) => s.properties.filter((p) => sameName(p.name, property)).map((p) => p.value));
}

function mapped(el: PhaseReader, mapping: PhaseMapping): PhaseId | null {
  const values = Object.fromEntries(Object.entries(mapping.values).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const sets of [el.propertySets(), el.typePropertySets()]) {
    for (const value of read(sets, (n) => sameName(n, mapping.set), mapping.property)) {
      const phase = typeof value === 'string' || typeof value === 'number' ? values[String(value).trim().toLowerCase()] : undefined;
      if (phase) return phase;
    }
  }
  return null;
}

/** The phase an element says: the mapped property, else its Status (own, then its type's); null when it says none. */
export function statedPhase(el: PhaseReader, source?: PhaseSource): PhaseId | null {
  if (source?.mapping?.set && source.mapping.property) {
    const phase = mapped(el, source.mapping);
    if (phase) return phase;
  }
  for (const sets of [el.propertySets(), el.typePropertySets()]) {
    for (const value of read(sets, (n) => COMMON_SET.test(n), 'Status')) {
      const phase = phaseOfStatus(value);
      if (phase) return phase;
    }
  }
  return null;
}

/** The phase of an element that says none: `unmarked`, else EXISTING. */
export const unmarkedPhase = (source?: PhaseSource): PhaseId => source?.unmarked ?? 'existing';

/** The phase of an element: the one it says (`statedPhase`), else `unmarked`, else EXISTING. */
export function resolvePhase(el: PhaseReader, source?: PhaseSource): PhaseId {
  return statedPhase(el, source) ?? unmarkedPhase(source);
}

const WEIGHT_MM: Record<CategoryLineWeight, number> = { heavy: 0.7, medium: 0.5, light: 0.25, hairline: 0.13 };

/** A phase's style in a view: the default look with the view's own edits over it. */
export function phaseStyle(graphics: ViewGraphics | undefined, phase: PhaseId): PhaseStyle {
  return { ...DEFAULT_PHASE_STYLES[phase], ...graphics?.phases?.styles?.[phase] };
}

/** The ink of a phase: colour, pen in paper millimetres (as a category's weight), dash in paper millimetres. */
export function phaseInk(graphics: ViewGraphics | undefined, phase: PhaseId): { color: string; weightMm: number; dash: number[]; fill: string } {
  const s = phaseStyle(graphics, phase);
  return { color: s.lineColor, weightMm: WEIGHT_MM[s.lineWeight], dash: s.dashed ? [3, 1.5] : [], fill: s.fillColor };
}

/** The phases a view shows, or null when it draws every element as the model has it (no phases set up). */
export function shownPhases(graphics: ViewGraphics | undefined): ReadonlySet<PhaseId> | null {
  return graphics?.phases ? new Set(graphics.phases.show) : null;
}

/** The ink of a drawing item (a line or cut face) that carries its phase (`styledDrawing` marks it), or null when it has none. */
export function itemInk(graphics: ViewGraphics | undefined, item: object): ReturnType<typeof phaseInk> | null {
  const phase = (item as { phase?: PhaseId }).phase;
  return phase ? phaseInk(graphics, phase) : null;
}
