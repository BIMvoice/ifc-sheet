/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rooms whose area is an estimate (#42): the model states none, so the footprint of the room's geometry stands in
 * (`room-areas.ts`). Au, a permit figure, includes them; this says how many, how much of Au they are and which, so the
 * estimate is never counted silently. A footprint ignores sloped ceilings, so it can be far above the true figure
 * (AC20-FZK-Haus's attic gallery: 107 m² against a stated 74.5 m²). Pure; the app and the command line both hand it the
 * rooms they read, and report what it returns (`readiness.ts`'s `estimatedAreas` finding, the urban sheet's note).
 */

import type { RoomRecord } from './room-schedule.js';

export interface EstimatedAreas {
  /** The rooms measured from geometry. */
  count: number;
  /** m²: what those rooms add to Au. */
  area: number;
  /** m²: Au, every room's known area (the schedule's building total). */
  au: number;
  /** `area` as a share of Au, per cent. */
  share: number;
  /** The rooms, in the order the schedule lists them (by level, then number). */
  rooms: readonly { id: string; number: string; name: string; area: number }[];
}

/** The estimates among `rooms`; null when every room's area is stated (or none has one). */
export function estimatedAreas(rooms: readonly RoomRecord[]): EstimatedAreas | null {
  const known = rooms.filter((r) => r.area !== null);
  const au = known.reduce((a, r) => a + (r.area as number), 0);
  const guessed = known.filter((r) => r.source === 'geometry');
  if (guessed.length === 0) return null;
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const ordered = [...guessed].sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity) || collator.compare(a.number, b.number) || collator.compare(a.name, b.name));
  const area = guessed.reduce((a, r) => a + (r.area as number), 0);
  return {
    count: guessed.length, area, au, share: au > 0 ? (area / au) * 100 : 0,
    rooms: ordered.map((r) => ({ id: r.id, number: r.number, name: r.name, area: r.area as number })),
  };
}
