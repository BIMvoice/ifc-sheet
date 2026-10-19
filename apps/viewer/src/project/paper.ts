/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Paper sizes: the ISO A-series, the elongated formats of ISO 5457 and
 * custom sizes, and the one reading of a paper from a file that accepts
 * every shape a project has ever stored it in.
 */

import type { CustomPaper, ElongatedPaper, Paper, PaperSize } from './types';

export const ISO_PAPERS: readonly PaperSize[] = ['A0', 'A1', 'A2', 'A3', 'A4'];

/** ISO A-series trimmed sizes, long side first (ISO 216 / ISO 5457 table of trimmed sizes), mm. */
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A0: { w: 1189, h: 841 },
  A1: { w: 841, h: 594 },
  A2: { w: 594, h: 420 },
  A3: { w: 420, h: 297 },
  A4: { w: 297, h: 210 },
};

/**
 * The special elongated sizes of ISO 5457 (the A-series size's long side kept
 * as the short side, the length rounded as the standard prints it), by base and
 * factor: A3×3 is 420 × 891 mm, A3×4 420 × 1189, A2×3 594 × 1261, A4×3 297 × 630,
 * A4×4 297 × 841. Width is the short side, length the long one.
 */
export const ELONGATED_MM: Record<string, { short: number; long: number }> = {
  'A0×2': { short: 1189, long: 1682 }, 'A0×3': { short: 1189, long: 2523 },
  'A1×3': { short: 841, long: 1783 }, 'A1×4': { short: 841, long: 2378 },
  'A2×3': { short: 594, long: 1261 }, 'A2×4': { short: 594, long: 1682 }, 'A2×5': { short: 594, long: 2102 },
  'A3×3': { short: 420, long: 891 }, 'A3×4': { short: 420, long: 1189 }, 'A3×5': { short: 420, long: 1486 },
  'A4×3': { short: 297, long: 630 }, 'A4×4': { short: 297, long: 841 }, 'A4×5': { short: 297, long: 1051 },
};

/** The elongated formats there are, as `{ base, factor }`, smallest base last. */
export const ELONGATED_PAPERS: readonly ElongatedPaper[] = Object.keys(ELONGATED_MM).map((key) => {
  const [base, factor] = key.split('×');
  return { kind: 'elongated', base: base as PaperSize, factor: Number(factor) };
});

/** A custom side must be within these bounds, mm (a title block needs room; a plotter has a limit). */
export const CUSTOM_MM = { min: 200, max: 10_000 } as const;

export const isElongated = (p: Paper): p is ElongatedPaper => typeof p === 'object' && p.kind === 'elongated';
export const isCustom = (p: Paper): p is CustomPaper => typeof p === 'object' && p.kind === 'custom';

/** The paper's sides, long first, mm; null for an elongated format ISO 5457 does not list. */
function sides(paper: Paper): { long: number; short: number } | null {
  if (typeof paper === 'string') return { long: PAPER_MM[paper].w, short: PAPER_MM[paper].h };
  if (paper.kind === 'custom') return { long: Math.max(paper.widthMm, paper.heightMm), short: Math.min(paper.widthMm, paper.heightMm) };
  return ELONGATED_MM[`${paper.base}×${paper.factor}`] ?? null;
}

/**
 * The paper's width and height on the sheet, mm: landscape has the long side
 * across, portrait down. An elongated format that is not in the table counts as its base.
 */
export function paperMm(paper: Paper, orientation: 'landscape' | 'portrait' = 'landscape'): { w: number; h: number } {
  const s = sides(paper) ?? sides((paper as ElongatedPaper).base)!;
  return orientation === 'landscape' ? { w: s.long, h: s.short } : { w: s.short, h: s.long };
}

/** The paper as printed on a list: `A1`, `A3×3`, `500×700` (a custom one with its long side first). */
export function paperLabel(paper: Paper): string {
  if (typeof paper === 'string') return paper;
  if (paper.kind === 'elongated') return `${paper.base}×${paper.factor}`;
  const s = sides(paper)!;
  return `${s.long}×${s.short}`;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown): v is number => isNumber(v) && v >= CUSTOM_MM.min && v <= CUSTOM_MM.max;

/**
 * A paper out of a file: a plain name (`'A1'`, what projects saved before
 * elongated and custom sizes hold), `{ kind: 'iso', size }`, an elongated
 * format ISO 5457 lists, or a custom size within bounds. Anything else is
 * `undefined` and the sheet falls back to the paper it names none.
 */
export function readPaper(v: unknown): Paper | undefined {
  if (typeof v === 'string') return ISO_PAPERS.includes(v as PaperSize) ? (v as PaperSize) : undefined;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind === 'iso') return ISO_PAPERS.includes(o.size as PaperSize) ? (o.size as PaperSize) : undefined;
  if (o.kind === 'elongated') {
    return typeof o.base === 'string' && isNumber(o.factor) && `${o.base}×${o.factor}` in ELONGATED_MM ? { kind: 'elongated', base: o.base as PaperSize, factor: o.factor } : undefined;
  }
  if (o.kind === 'custom') return inRange(o.widthMm) && inRange(o.heightMm) ? { kind: 'custom', widthMm: o.widthMm, heightMm: o.heightMm } : undefined;
  return undefined;
}

/** The paper a list names (`paperLabel`'s text); undefined when it is none. */
export function paperFromLabel(label: unknown): Paper | undefined {
  if (typeof label !== 'string') return undefined;
  const iso = readPaper(label);
  if (iso) return iso;
  const long = /^(A[0-4])[×x](\d)$/.exec(label);
  if (long) return readPaper({ kind: 'elongated', base: long[1], factor: Number(long[2]) });
  const custom = /^(\d+(?:\.\d+)?)[×x](\d+(?:\.\d+)?)$/.exec(label);
  return custom ? readPaper({ kind: 'custom', widthMm: Number(custom[1]), heightMm: Number(custom[2]) }) : undefined;
}
