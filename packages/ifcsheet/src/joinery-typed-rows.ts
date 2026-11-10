/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a door and window schedule's rows read from the TYPE rather than from the IFC elements (#448): the value of a property typed in for
 * the type (`fillTypedValues`), and the size measured from the geometry of a type configured from the IFC whose elements state none
 * (`noteMeasured`, `markMeasuredTypes`; the measurement is #485's).
 */

import { customValueOf } from './joinery-custom-props.js';
import type { ModelRow } from './joinery-model-rows.js';
import type { ScheduleEntry } from './joinery-schedule.js';

/** A property typed in for a type is the value of every element of the type, for a model row chosen from `CUSTOM_PSET`. */
export function fillTypedValues(entries: Iterable<ScheduleEntry>, rows: readonly ModelRow[]): void {
  for (const e of entries) for (const row of rows) {
    const typed = customValueOf(e.spec, row);
    if (typed !== undefined) for (const o of e.occurrences) (o.modelValues ??= {})[row.id] = typed;
  }
}

export interface MeasuredSize { width: number; height: number; measuredWidth: boolean; measuredHeight: boolean }

/** Records, on the element just counted into `entry`, that its size was measured, and keeps the first measured size of the entry. */
export function noteMeasured(entry: ScheduleEntry, into: Map<string, { width: number; height: number }>, m: MeasuredSize): void {
  if (!m.measuredWidth && !m.measuredHeight) return;
  Object.assign(entry.occurrences[entry.occurrences.length - 1], { measured: true, measuredWidth: m.measuredWidth, measuredHeight: m.measuredHeight });
  if (!into.has(entry.key)) into.set(entry.key, { width: m.width, height: m.height });
}

/** A configured entry whose every element lacks a side prints the measured one, marked: the entry's default stays only where something states a figure. */
export function markMeasuredTypes(entries: readonly ScheduleEntry[], measured: ReadonlyMap<string, { width: number; height: number }>): void {
  for (const e of entries) {
    const m = measured.get(e.key);
    if (!e.spec || !m || !e.occurrences.every((o) => o.measured)) continue;
    if (e.occurrences.every((o) => o.measuredWidth)) { e.measuredWidth = true; e.width = m.width; }
    if (e.occurrences.every((o) => o.measuredHeight)) { e.measuredHeight = true; e.height = m.height; }
    e.measured = e.measuredWidth || e.measuredHeight;
  }
}
