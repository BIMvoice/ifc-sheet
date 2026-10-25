/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the drafting standards of a project file — text styles, dimension
 * styles, layer groups — tolerantly: a malformed field falls back to the
 * standard style's, an unreadable entry is dropped, and the Standard styles
 * are always there.
 */

import {
  DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE, STANDARD,
  type ArrowKind, type DimStyle, type FontKind, type LayerGroup, type LengthUnit, type TextPlacement, type TextStyle,
} from '@/drafting/styles';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? { color: v } : {});

function readText(v: Raw): TextStyle {
  const d = DEFAULT_TEXT_STYLE;
  return {
    id: str(v.id, d.id), name: str(v.name, d.name), height: num(v.height, d.height) || d.height,
    font: oneOf<FontKind>(v.font, ['sans', 'serif', 'mono'], d.font), bold: v.bold === true, italic: v.italic === true, ...color(v.color),
  };
}

function readDim(v: Raw): DimStyle {
  const d = DEFAULT_DIM_STYLE;
  return {
    id: str(v.id, d.id), name: str(v.name, d.name), textStyle: str(v.textStyle, d.textStyle),
    arrow: oneOf<ArrowKind>(v.arrow, ['tick', 'arrow', 'dot', 'none'], d.arrow), arrowSize: num(v.arrowSize, d.arrowSize),
    extGap: num(v.extGap, d.extGap), extOver: num(v.extOver, d.extOver),
    placement: oneOf<TextPlacement>(v.placement, ['above', 'centered', 'below'], d.placement), textGap: num(v.textGap, d.textGap),
    precision: Math.round(num(v.precision, d.precision)), unit: oneOf<LengthUnit>(v.unit, ['m', 'cm', 'mm'], d.unit), ...color(v.color),
  };
}

function withStandard<T extends { id: string }>(list: T[], standard: T): T[] {
  return list.some((s) => s.id === STANDARD) ? list : [{ ...standard }, ...list];
}

const listOf = (raw: Raw, key: string) => (Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter(isObject) : []);

/** Kept as named, known or not: loading the project falls back to the default for an unknown id, and says so (`loadProjectDocument`). */
export function readGraphicStandard(raw: Raw): string | undefined {
  return typeof raw.graphicStandard === 'string' && raw.graphicStandard !== DEFAULT_GRAPHIC_STANDARD.id ? raw.graphicStandard : undefined;
}

export const readTextStyles = (raw: Raw): TextStyle[] => withStandard(listOf(raw, 'textStyles').map(readText), DEFAULT_TEXT_STYLE);
export const readDimStyles = (raw: Raw): DimStyle[] => withStandard(listOf(raw, 'dimStyles').map(readDim), DEFAULT_DIM_STYLE);

export const readLayerGroups = (raw: Raw): LayerGroup[] =>
  listOf(raw, 'layerGroups').filter((g) => typeof g.id === 'string').map((g) => ({
    id: g.id as string, name: str(g.name, 'Group'), visible: g.visible !== false, locked: g.locked === true,
  }));

export function readStandards(raw: Raw): { textStyles: TextStyle[]; dimStyles: DimStyle[]; layerGroups: LayerGroup[]; graphicStandard?: string } {
  const standard = readGraphicStandard(raw);
  return {
    ...(standard ? { graphicStandard: standard } : {}),
    textStyles: readTextStyles(raw),
    dimStyles: readDimStyles(raw),
    layerGroups: readLayerGroups(raw),
  };
}
