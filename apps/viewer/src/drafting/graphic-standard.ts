/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Graphic standards: the paper pens and the text sizes of a drawing set,
 * chosen once per project (`ProjectDocument.graphicStandard`).
 *
 * A standard is DATA fed into the one path pens take to a sheet: the sheet
 * SVG (`SheetPaper`), its print / PDF (the same SVG) and the DXF exports
 * (which read the pen tags the SVG carries) all take their widths from
 * `viewportPens(…, standard)` and the sheet's own marks from `standard.sheet`
 * / `standard.type`. A standard's text and dimension styles are added to the
 * project's style book under their own names and selected for new
 * annotations (`setGraphicStandard`); the project's own styles, Standard
 * included, are never overwritten, so going back to the default restores
 * them exactly.
 *
 * Every value says where it comes from:
 *  - "series":   a member of the ISO 128 line-width series or the ISO 3098
 *                lettering-height series (the sets below; a test iterates the
 *                standard and rejects anything outside them);
 *  - "practice": a convention of drawing offices, not a written rule.
 * No standard here is certified by any body.
 */

import type { CategoryLineWeight } from '@/project/types';
import { DEFAULT_DIM_STYLE, STANDARD, type DimStyle, type TextStyle } from './styles';

/** ISO 128 line widths in paper millimetres (the series 0.13 … 2, ratio of √2 between members). */
export const ISO_128_LINE_WIDTHS: readonly number[] = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];

/** ISO 3098 nominal lettering heights in paper millimetres. */
export const ISO_3098_HEIGHTS: readonly number[] = [1.8, 2.5, 3.5, 5, 7, 10, 14, 20];

/** A category weight as a pen pair: the cut line and the line seen beyond the cut. */
export interface WeightPair {
  cut: number;
  projection: number;
}

export interface GraphicStandard {
  id: string;
  name: string;
  /** The pens of the generated drawing, paper mm. */
  pens: { cut: number; outline: number; seen: number; hidden: number; hatch: number };
  /** What a view-graphics category weight means as a pen, paper mm. */
  weights: Record<CategoryLineWeight, WeightPair>;
  /** Hatch pen of a material's drawing settings, paper mm. */
  materialHatch: Record<CategoryLineWeight, number>;
  /** The sheet's own linework, paper mm. */
  sheet: { frame: number; titleOuter: number; titleDivider: number; titleRule: number };
  /** The sheet's own text, paper mm: title block captions and values, sheet number, scale, and the view title under a viewport. */
  type: { caption: number; value: number; number: number; scale: number; viewTitle: number };
  /** Text and dimension styles the standard adds to the project, under ids of its own (never `STANDARD`). */
  textStyles: readonly TextStyle[];
  dimStyles: readonly DimStyle[];
  /** The text and dimension style new annotations take under this standard. */
  current: { textStyle: string; dimStyle: string };
}

/** What IfcSheet drew before standards existed. Choosing it restores exactly that. */
export const DEFAULT_GRAPHIC_STANDARD: GraphicStandard = {
  id: 'default',
  name: 'IfcSheet default',
  pens: { cut: 0.5, outline: 0.5, seen: 0.25, hidden: 0.18, hatch: 0.13 },
  weights: {
    heavy: { cut: 0.7, projection: 0.35 }, medium: { cut: 0.5, projection: 0.25 },
    light: { cut: 0.25, projection: 0.125 }, hairline: { cut: 0.13, projection: 0.065 },
  },
  materialHatch: { heavy: 0.35, medium: 0.25, light: 0.18, hairline: 0.13 },
  sheet: { frame: 0.7, titleOuter: 0.5, titleDivider: 0.35, titleRule: 0.18 },
  type: { caption: 2, value: 3.5, number: 9, scale: 4.5, viewTitle: 3.5 },
  // The default brings no styles: the project's own Standard styles are what it draws with.
  textStyles: [],
  dimStyles: [],
  current: { textStyle: STANDARD, dimStyle: STANDARD },
};

const RO_TEXT_STYLES: readonly TextStyle[] = [
  { id: 'ro-text-25', name: 'Text 2.5', height: 2.5, font: 'sans', bold: false, italic: false },
  { id: 'ro-text-35', name: 'Text 3.5', height: 3.5, font: 'sans', bold: false, italic: false },
  { id: 'ro-title-50', name: 'Title 5', height: 5, font: 'sans', bold: false, italic: false },
  { id: 'ro-title-70', name: 'Title 7', height: 7, font: 'sans', bold: true, italic: false },
];

/**
 * Romanian practice: ISO 128 line widths and ISO 3098 lettering heights, with the
 * Romanian standards for lines and lettering (STAS 103, STAS 186) as the national
 * counterparts. The widths and heights are taken from the ISO series; WHICH member
 * a pen takes is office practice (the written standards give the series and the
 * thick : thin pairing, not "cut walls are 0.7 mm"). IfcSheet does not scale pens
 * with the view scale, so this is one set for every scale.
 */
export const ROMANIAN_PRACTICE: GraphicStandard = {
  id: 'ro-practice',
  // STAS is not in the label: no value was checked against a STAS text.
  name: 'Romanian practice (ISO 128 / ISO 3098)',
  // practice: cut 0.7 (thick); the outline of what is seen beyond the cut is one 2:1 step thinner, 0.35.
  pens: { cut: 0.7, outline: 0.35, seen: 0.25, hidden: 0.18, hatch: 0.13 },
  // series, paired thick : thin at 2:1 or the next step of the series (practice).
  weights: {
    heavy: { cut: 0.7, projection: 0.35 }, medium: { cut: 0.5, projection: 0.25 },
    light: { cut: 0.35, projection: 0.18 }, hairline: { cut: 0.18, projection: 0.13 },
  },
  materialHatch: { heavy: 0.35, medium: 0.25, light: 0.18, hairline: 0.13 },
  // practice: frame 0.7 (a thick line), title block outline 0.5, dividers 0.35, rules 0.18.
  sheet: { frame: 0.7, titleOuter: 0.5, titleDivider: 0.35, titleRule: 0.18 },
  // practice: which ISO 3098 height serves which role.
  type: { caption: 2.5, value: 3.5, number: 7, scale: 5, viewTitle: 5 },
  textStyles: RO_TEXT_STYLES,
  // practice: oblique stroke terminators, extension line gap 1 and overshoot 2, value 1 above the line.
  dimStyles: [{ ...DEFAULT_DIM_STYLE, id: 'ro-dim', name: 'Dimensions 2.5', textStyle: 'ro-text-25', arrow: 'tick', arrowSize: 2.5, extGap: 1, extOver: 2, textGap: 1 }],
  current: { textStyle: 'ro-text-25', dimStyle: 'ro-dim' },
};

export const GRAPHIC_STANDARDS: readonly GraphicStandard[] = [DEFAULT_GRAPHIC_STANDARD, ROMANIAN_PRACTICE];

/** The standard a project names; an unknown or absent id is the default. */
export function graphicStandardOf(id: string | undefined): GraphicStandard {
  return GRAPHIC_STANDARDS.find((s) => s.id === id) ?? DEFAULT_GRAPHIC_STANDARD;
}

/** Every pen width and text height of a standard, with its role: what the series test iterates. */
export function standardValues(s: GraphicStandard): { kind: 'width' | 'height'; role: string; value: number }[] {
  const w = (role: string, value: number) => ({ kind: 'width' as const, role, value });
  const h = (role: string, value: number) => ({ kind: 'height' as const, role, value });
  return [
    ...Object.entries(s.pens).map(([k, v]) => w(`pens.${k}`, v)),
    ...Object.entries(s.weights).flatMap(([k, p]) => [w(`weights.${k}.cut`, p.cut), w(`weights.${k}.projection`, p.projection)]),
    ...Object.entries(s.materialHatch).map(([k, v]) => w(`materialHatch.${k}`, v)),
    ...Object.entries(s.sheet).map(([k, v]) => w(`sheet.${k}`, v)),
    ...Object.entries(s.type).map(([k, v]) => h(`type.${k}`, v)),
    ...s.textStyles.map((t) => h(`textStyles.${t.id}`, t.height)),
  ];
}

/**
 * The id a file names, checked against the built-in standards: a built-in
 * one other than the default, nothing (absent, or the default), or unknown
 * (a file from a newer app; the caller falls back to the default and says so).
 */
export function knownGraphicStandard(id: unknown): { id?: string; unknown?: string } {
  if (id === undefined || id === DEFAULT_GRAPHIC_STANDARD.id) return {};
  const known = GRAPHIC_STANDARDS.find((g) => g.id === id);
  return known ? { id: known.id } : { unknown: String(id) };
}

/** A style as comparable text: flat objects, keys sorted, so a file round trip that reorders keys still compares equal. */
const canonical = (style: object): string => JSON.stringify(style, Object.keys(style).sort());

/**
 * One style list under `own`, the chosen standard's styles. A style another
 * built-in standard brought and the user left as it came goes; one the user
 * edited is theirs now and stays. Every other style stays as it is, in its
 * place. The chosen standard's styles are appended where their id is free:
 * one already there (edited or not) is never overwritten.
 */
function listUnder<T extends { id: string }>(own: readonly T[], brought: readonly T[], list: readonly T[]): T[] {
  const asBrought = new Map(brought.map((x) => [x.id, canonical(x)]));
  const ownIds = new Set(own.map((x) => x.id));
  const kept = list.filter((x) => ownIds.has(x.id) || asBrought.get(x.id) !== canonical(x));
  const taken = new Set(kept.map((x) => x.id));
  return [...kept, ...own.filter((x) => !taken.has(x.id)).map((x) => ({ ...x }))];
}

/**
 * The project's style lists under `standard` (see `listUnder`). Going from the
 * default to a standard and back returns the lists the project had, exactly,
 * as long as the standard's styles were not edited meanwhile.
 */
export function stylesUnder(standard: GraphicStandard, textStyles: readonly TextStyle[], dimStyles: readonly DimStyle[]): { textStyles: TextStyle[]; dimStyles: DimStyle[] } {
  return {
    textStyles: listUnder(standard.textStyles, GRAPHIC_STANDARDS.flatMap((g) => g.textStyles), textStyles),
    dimStyles: listUnder(standard.dimStyles, GRAPHIC_STANDARDS.flatMap((g) => g.dimStyles), dimStyles),
  };
}
