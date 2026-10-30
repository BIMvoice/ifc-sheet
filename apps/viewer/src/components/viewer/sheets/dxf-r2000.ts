/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DXF R2000 (AC1015) for drawing exports — what CAD layers need: every
 * layer with its colour (ACI and true colour), line type and line weight,
 * entities BYLAYER unless they differ from their layer.
 *
 * A complete minimal R2000 document (tables, blocks, layouts, dictionaries —
 * what strict readers expect) is kept as a skeleton file; this writer adds
 * line types to its LTYPE table, layers to its LAYER table and entities to
 * ENTITIES, with handles above the skeleton's, and sets $HANDSEED. Text is
 * written as windows-1252 (`encodeDxfCp1252`), declared in the header; a TEXT letter outside windows-1252 (ă, ș, ț) is written as the
 * `\U+XXXX` escape that R2000 readers decode (#617), where a plain encode would have made it `?`.
 */

import { encodeDxfCp1252 } from '@ifc-lite/drawing-2d';
import { dashOf, type LineType } from '@/drafting/styles';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import skeleton from './dxf-r2000-skeleton.dxf?raw';

type P = { x: number; y: number };

/** Skeleton handles: the LTYPE and LAYER tables, model space's block record, the plot-style placeholder. */
const LTYPE_TABLE = '2';
const LAYER_TABLE = '1';
const STYLE_TABLE = '5';
const MODEL_SPACE = '17';
const PLOT_STYLE = '13';
const FIRST_HANDLE = 0x100;

/** DXF line weights, 1/100 mm. */
const WEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

/** A pen width in mm as the nearest DXF line weight. */
export function dxfLineWeight(mm: number): number {
  const v = Math.round(mm * 100);
  return WEIGHTS.reduce((best, w) => (Math.abs(w - v) < Math.abs(best - v) ? w : best), 25);
}

const ACI: [number, [number, number, number]][] = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]],
  [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]],
];

export function rgbOf(css: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (h) {
    const n = parseInt(h[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  return [0, 0, 0];
}

/** The nearest ACI colour (black and white both 7, "foreground"). */
export function aciOf(css: string): number {
  const c = rgbOf(css);
  let best = 7, bestD = Infinity;
  for (const [index, [r, g, b]] of ACI) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) { best = index; bestD = d; }
  }
  return best;
}

const trueColor = (css: string) => {
  const [r, g, b] = rgbOf(css);
  return (r << 16) | (g << 8) | b;
};

/**
 * A TEXT value for a windows-1252 file: a character windows-1252 has no byte for becomes `\U+XXXX` (one per UTF-16 unit, uppercase hex), which AutoCAD and
 * the readers that follow it decode; a literal `\U+` in the value is escaped first so it is not read back as one.
 */
export const escapeDxfText = (value: string): string =>
  value.replace(/\\U\+/gi, '\\U+005CU+').replace(/[^\u0000-\u007f\u00a0-\u00ff]/gu, (ch) => {
    if (!encodeDxfCp1252(ch).hadUnmappable) return ch;
    return Array.from({ length: ch.length }, (_, i) => `\\U+${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`).join('');
  });

const fmt = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(4)).toString() : '0');
const safeName = (s: string) => s.replace(/[<>/\\":;?*|=`]/g, '_').trim().slice(0, 255) || '0';
const LINE_TYPE_NAME: Record<LineType, string> = { continuous: 'Continuous', dashed: 'DASHED', dotted: 'DOT', dashdot: 'DASHDOT' };

/**
 * A project line type's name as a DXF table name: ASCII only (a letter outside windows-1252, such as ș, ț or ă, would be written as `?`,
 * and two such names would collide), diacritics reduced to their base letter, anything else `_`. The project keeps the display name.
 */
export const ltypeName = (name: string): string =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9$-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 255) || 'LTYPE';

/** The DXF text style the tables use (#500) and the font file each face names; a CAD program substitutes where it lacks the file. */
export const TABLES_DXF_STYLE = 'Tables';
const TABLES_FONT_FILE = { sans: 'arial.ttf', serif: 'times.ttf', mono: 'cour.ttf' } as const;
export type TablesFace = keyof typeof TABLES_FONT_FILE;

export interface PenSpec {
  color: string;
  /** A built-in line type or the id of a project line type defined on the writer (`defineLineType`); anything else is continuous. */
  lineType?: string;
  /** False: the layer does not plot. */
  print?: boolean;
  /** Millimetres. */
  lineWeight?: number;
}

interface Layer { color: string; lineType: string; lineWeight: number; print: boolean }

export class DxfR2000 {
  private readonly layers = new Map<string, Layer>();
  private readonly out: string[] = [];
  private handle = FIRST_HANDLE;
  private tablesFace: TablesFace | undefined;

  /** `patternScale` multiplies line-type dash lengths (paper mm): the view's scale for a 1:1 model export. */
  constructor(private readonly patternScale = 1) {}

  private readonly custom = new Map<string, { name: string; display: string; dash: number[] }>();

  /** Add a line type of the project, its dash pattern in paper mm (as `dashOf` gives for the built-in ones). */
  defineLineType(id: string, name: string, dash: readonly number[]): void {
    // Reserved: the built-in names and the two a CAD program always has (ByLayer, ByBlock). Names compare without case.
    const taken = new Set([...Object.values(LINE_TYPE_NAME), 'ByLayer', 'ByBlock', ...[...this.custom.values()].map((c) => c.name)].map((n) => n.toUpperCase()));
    let unique = ltypeName(name);
    while (taken.has(unique.toUpperCase())) unique += '_';
    this.custom.set(id, { name: unique, display: safeName(name), dash: [...dash] });
  }

  /** The DXF name of a line type; an unknown one is continuous. */
  private ltName(type: string): string {
    return (LINE_TYPE_NAME as Record<string, string>)[type] ?? this.custom.get(type)?.name ?? LINE_TYPE_NAME.continuous;
  }

  private next(): string {
    return (this.handle++).toString(16).toUpperCase();
  }

  /** Register a layer (its first pen defines it) and return its DXF name. */
  layer(raw: string, pen: PenSpec): string {
    const name = safeName(raw);
    if (!this.layers.has(name)) this.layers.set(name, { color: pen.color, lineType: pen.lineType ?? 'continuous', lineWeight: dxfLineWeight(pen.lineWeight ?? 0.25), print: pen.print !== false });
    return name;
  }

  /** Group codes for what an entity does not take BYLAYER. */
  private own(layer: string, pen?: PenSpec): string[] {
    const l = this.layers.get(layer);
    if (!pen || !l) return [];
    const out: string[] = [];
    if (aciOf(pen.color) !== aciOf(l.color) || trueColor(pen.color) !== trueColor(l.color)) out.push('62', String(aciOf(pen.color)), '420', String(trueColor(pen.color)));
    if (pen.lineType && pen.lineType !== l.lineType) out.push('6', this.ltName(pen.lineType));
    if (pen.lineWeight !== undefined && dxfLineWeight(pen.lineWeight) !== l.lineWeight) out.push('370', String(dxfLineWeight(pen.lineWeight)));
    return out;
  }

  private head(kind: string, layer: string, pen?: PenSpec): string[] {
    return ['0', kind, '5', this.next(), '330', MODEL_SPACE, '100', 'AcDbEntity', '8', layer, ...this.own(layer, pen)];
  }

  line(a: P, b: P, layer: string, pen?: PenSpec): void {
    this.out.push(...this.head('LINE', layer, pen), '100', 'AcDbLine', '10', fmt(a.x), '20', fmt(a.y), '30', '0', '11', fmt(b.x), '21', fmt(b.y), '31', '0');
  }

  polyline(pts: readonly P[], layer: string, pen?: PenSpec, closed = false): void {
    if (pts.length < 2) return;
    this.out.push(...this.head('LWPOLYLINE', layer, pen), '100', 'AcDbPolyline', '90', String(pts.length), '70', closed ? '1' : '0');
    for (const p of pts) this.out.push('10', fmt(p.x), '20', fmt(p.y));
  }

  /**
   * A solid fill of `loops` (the outer boundary and any holes, filled even-odd), in the colour `pen` gives: a HATCH on `layer`.
   * Loops of fewer than three points are left out.
   */
  hatch(loops: readonly (readonly P[])[], layer: string, pen?: PenSpec): void {
    const paths = loops.filter((l) => l.length >= 3);
    if (paths.length === 0) return;
    this.out.push(...this.head('HATCH', layer, pen), '100', 'AcDbHatch', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1', '2', 'SOLID', '70', '1', '71', '0', '91', String(paths.length));
    paths.forEach((path, i) => {
      // A polyline boundary (bit 2); the first is the external one (bit 1).
      this.out.push('92', i === 0 ? '3' : '2', '72', '0', '73', '1', '93', String(path.length));
      for (const p of path) this.out.push('10', fmt(p.x), '20', fmt(p.y));
      this.out.push('97', '0');
    });
    this.out.push('75', '0', '76', '1', '98', '0');
  }

  /**
   * The same loops hatched with `pattern` (#493), a HATCH that carries the pattern's own definition lines (so a program without the
   * pattern file draws it too), `unit` DXF units per pattern millimetre. `mirrored`: the loops are in a frame whose y runs the other way
   * from the pattern's (the sheet's y is flipped into DXF), so the pattern's angles and its perpendicular offsets turn with it.
   */
  patternHatch(loops: readonly (readonly P[])[], pattern: HatchPattern, unit: number, layer: string, pen?: PenSpec, mirrored = true): void {
    const paths = loops.filter((l) => l.length >= 3);
    if (paths.length === 0 || pattern.solid || pattern.families.length === 0) return;
    const sign = mirrored ? -1 : 1;
    this.out.push(...this.head('HATCH', layer, pen), '100', 'AcDbHatch', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1', '2', safeName(pattern.name).toUpperCase().replace(/\s+/g, '_'), '70', '0', '71', '0', '91', String(paths.length));
    paths.forEach((path, i) => {
      this.out.push('92', i === 0 ? '3' : '2', '72', '0', '73', '1', '93', String(path.length));
      for (const p of path) this.out.push('10', fmt(p.x), '20', fmt(p.y));
      this.out.push('97', '0');
    });
    // Style normal, pattern type predefined; the definition lines follow, each scaled by `unit` (dashes: positive on, negative off).
    this.out.push('75', '0', '76', '1', '52', '0', '41', '1', '77', '0', '78', String(pattern.families.length));
    for (const f of pattern.families) {
      // DXF writes the line's offset to the next line in the drawing's axes (code 45/46), while a `.pat` file gives it along and across the line:
      // turn it by the line's angle (as written, so a mirrored frame turns it the other way), or an angled family is spaced wrongly in CAD.
      const turn = (sign * f.angleDeg * Math.PI) / 180;
      const dx = f.deltaX * unit;
      const dy = sign * f.deltaY * unit;
      this.out.push('53', fmt(sign * f.angleDeg), '43', fmt(f.origin.x * unit), '44', fmt(sign * f.origin.y * unit),
        '45', fmt(dx * Math.cos(turn) - dy * Math.sin(turn)), '46', fmt(dx * Math.sin(turn) + dy * Math.cos(turn)), '79', String(f.dashes.length));
      for (const d of f.dashes) this.out.push('49', fmt(d * unit));
    }
    this.out.push('98', '0');
  }

  text(at: P, value: string, height: number, layer: string, options: { rotationDeg?: number; align?: 'left' | 'center' | 'right'; pen?: PenSpec; tablesFace?: TablesFace } = {}): void {
    const clean = value.replace(/[\r\n]+/g, ' ').trim();
    if (!clean || !(height > 0)) return;
    const h = options.align === 'center' ? 1 : options.align === 'right' ? 2 : 0;
    this.out.push(...this.head('TEXT', layer, options.pen), '100', 'AcDbText', '10', fmt(at.x), '20', fmt(at.y), '30', '0', '40', fmt(height), '1', escapeDxfText(clean),
      '50', fmt(options.rotationDeg ?? 0), '7', options.tablesFace ? TABLES_DXF_STYLE : 'Standard');
    if (options.tablesFace) this.tablesFace = options.tablesFace;
    if (h) this.out.push('72', String(h), '11', fmt(at.x), '21', fmt(at.y), '31', '0');
    this.out.push('100', 'AcDbText');
  }

  private lineTypes(): string[] {
    const out: string[] = [];
    for (const type of ['dashed', 'dotted', 'dashdot'] as const) {
      // Dashes positive, gaps negative, in drawing units.
      const dashes = dashOf(type).map((d, i) => (i % 2 === 0 ? d : -d) * this.patternScale);
      out.push('0', 'LTYPE', '5', this.next(), '330', LTYPE_TABLE, '100', 'AcDbSymbolTableRecord', '100', 'AcDbLinetypeTableRecord',
        '2', LINE_TYPE_NAME[type], '70', '0', '3', type, '72', '65', '73', String(dashes.length), '40', fmt(dashes.reduce((s, d) => s + Math.abs(d), 0)));
      for (const d of dashes) out.push('49', fmt(d), '74', '0');
    }
    for (const { name, display, dash } of this.custom.values()) {
      const dashes = dash.map((d, i) => (i % 2 === 0 ? d : -d) * this.patternScale);
      out.push('0', 'LTYPE', '5', this.next(), '330', LTYPE_TABLE, '100', 'AcDbSymbolTableRecord', '100', 'AcDbLinetypeTableRecord',
        '2', name, '70', '0', '3', display, '72', '65', '73', String(dashes.length), '40', fmt(dashes.reduce((s, d) => s + Math.abs(d), 0)));
      for (const d of dashes) out.push('49', fmt(d), '74', '0');
    }
    return out;
  }

  private layerTable(): string[] {
    const out: string[] = [];
    for (const [name, l] of this.layers) {
      if (name === '0') continue;
      out.push('0', 'LAYER', '5', this.next(), '330', LAYER_TABLE, '100', 'AcDbSymbolTableRecord', '100', 'AcDbLayerTableRecord',
        '2', name, '70', '0', '62', String(aciOf(l.color)), '420', String(trueColor(l.color)), '6', this.ltName(l.lineType), '370', String(l.lineWeight), '390', PLOT_STYLE, ...(l.print ? [] : ['290', '0']));
    }
    return out;
  }

  /** The document, windows-1252 encoded. */
  bytes(comment: string): Uint8Array {
    const ltypes = this.lineTypes();
    const layers = this.layerTable();
    const styles = this.tablesFace
      ? ['0', 'STYLE', '5', this.next(), '330', STYLE_TABLE, '100', 'AcDbSymbolTableRecord', '100', 'AcDbTextStyleTableRecord', '2', TABLES_DXF_STYLE, '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', TABLES_FONT_FILE[this.tablesFace], '4', '']
      : [];
    const pairs = (list: string[]) => list.map((v, i) => (i % 2 === 0 ? v.padStart(3) : v)).join('\n');
    const text = skeleton
      .replace(/^999\n[^\n]*\n/, `999\n${comment.replace(/\n/g, ' ')}\n`)
      .replace('{{LTYPES}}\n', ltypes.length ? `${pairs(ltypes)}\n` : '')
      .replace('{{LAYERS}}\n', layers.length ? `${pairs(layers)}\n` : '')
      .replace('{{STYLES}}\n', styles.length ? `${pairs(styles)}\n` : '')
      .replace('{{ENTITIES}}\n', this.out.length ? `${pairs(this.out)}\n` : '')
      .replace('{{HANDSEED}}', this.handle.toString(16).toUpperCase());
    return encodeDxfCp1252(text).bytes;
  }
}
