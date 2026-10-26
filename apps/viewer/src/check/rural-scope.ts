/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether the loaded model is inside what the simplified permit project covers: Legea 169/2026 Anexa 3, "locuință unifamilială
 * în mediul rural (regim de înălțime de maxim P + M și o suprafață construită desfășurată de maximum 150 mp)". A warning, never a
 * block: the set is made either way (the template steps its sheets up to a larger paper for a larger building).
 *
 * - Levels. A storey counts when its floor is at or above ±0.00 (`elevation >= 0`, the urban indicators' own reference, to a
 *   millimetre). P + M is two: the ground floor and the attic (mansardă, modelled as a storey). A basement or any storey below
 *   ±0.00 is not counted as a level: the text names no basement, so it neither passes nor fails the height rule. Its built area
 *   still counts in Sd, as it does in the area summary.
 * - Area. Sd, suprafața construită desfășurată: `areaSummary(...).building.sd`, the room schedule's own figure (the sum of the
 *   built areas of all storeys), not a second computation. A lower bound (a storey gave no outline) over the limit is over it.
 */

import { sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';
import { areaSummary } from '@/urban/area-summary';
import type { UrbanIndicators } from '@/urban/indicators';
import type { TranslationKey } from '@/i18n';

/** The most levels above ground Anexa 3 covers: P + M. */
export const RURAL_MAX_LEVELS = 2;
/** The most built gross area, m², Anexa 3 covers. */
export const RURAL_MAX_SD = 150;

/** A storey's floor within this of ±0.00 (metres) is on it. */
const ON_ZERO = 0.001;

export interface RuralScopeFinding {
  key: 'pac.rural.scope.levels' | 'pac.rural.scope.area' | 'pac.rural.scope.areaAtLeast';
  params: { count: number } | { area: number; max: number };
}

/** What is outside Anexa 3's scope in the model whose indicators are `result`; empty when it is inside (or nothing is measured). */
export function ruralScopeFindings(result: UrbanIndicators): RuralScopeFinding[] {
  const out: RuralScopeFinding[] = [];
  const levels = result.storeys.filter((s) => s.elevation >= -ON_ZERO).length;
  if (levels > RURAL_MAX_LEVELS) out.push({ key: 'pac.rural.scope.levels', params: { count: levels } });
  const { sd, sdAtLeast } = areaSummary(result).building;
  if (sd !== null && sd > RURAL_MAX_SD) out.push({ key: sdAtLeast ? 'pac.rural.scope.areaAtLeast' : 'pac.rural.scope.area', params: { area: Math.round(sd * 10) / 10, max: RURAL_MAX_SD } });
  return out;
}

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** A finding in words, its numbers written the way the sheet writes them. */
export function describeRuralScope(f: RuralScopeFinding, t: T, locale: SheetLocale): string {
  const p = f.params;
  return t(f.key as TranslationKey, 'area' in p ? { area: sheetNumber(locale, p.area, 1), max: sheetNumber(locale, p.max, 0) } : p);
}
