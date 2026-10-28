/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An office's own title block (#458): the line work and the fixed text of a DXF (or an SVG, `title-block-import-svg.ts`)
 * become a `TitleBlockTemplate`, the one layout the app edits (#143), saves with the project and the PDF, the DXF and
 * `ifcsheet build --project` print. Nothing parallel: the import only produces that data. The user then places the named
 * fields on it ({@link placeField}), each one of the names the built-in block fills (`BUILTIN_PARAMS`, #86), and may keep
 * the result as a library item a standards pack carries ({@link ownTitleBlockPack}).
 *
 * Size. A block is 180 x 50 mm (`TITLE_BLOCK_MM`) and sits in the sheet frame's corner. The drawing is taken at its true
 * size, its top-left corner on the block's, and shrunk by one factor (never enlarged) when it is wider than 180 or taller
 * than 50 mm. The true size comes from the DXF's `$INSUNITS`; a file without it is read as millimetres, which is how title
 * blocks are drawn, and says so in `notes`. A file in metres, inches or feet is converted by its header; a block that
 * then does not fit is shrunk and told so.
 */

import { convertDxfToUnderlay, parseDxf } from '@ifc-lite/drawing-2d';
import { TitleBlockImportError, type RawSegment, type RawShapes, type RawText } from './title-block-import-shapes.js';
import { readSvgShapes } from './title-block-import-svg.js';
import { PACK_NOT_SET, STANDARD_PACK_VERSION, type StandardPack } from './standard-pack.js';
import { TITLE_BLOCK_MM } from './sheet-frame.js';
import { BUILTIN_PARAMS, SOFT_BUILTINS } from './title-block-params.js';
import { textWidthEm } from './text-width.js';
import { MAX_TEXT, type TemplateItem, type TemplateText, type TitleBlockTemplate } from './title-block-template.js';

export { TitleBlockImportError, type RawSegment, type RawShapes, type RawText } from './title-block-import-shapes.js';

/** The most items a layout holds (the file reader keeps the first 500). */
export const MAX_TEMPLATE_ITEMS = 500;

export interface ImportedTitleBlock {
  template: TitleBlockTemplate;
  /** Millimetres the imported block spans, after any shrinking. */
  size: { w: number; h: number };
  /** The factor the drawing was shrunk by to fit the block's area; 1 when it already did. */
  shrunkBy: number;
  /** What the import assumed or left out, in words. */
  notes: string[];
}

const DEFAULT_WEIGHT = 0.25;
const clampWeight = (w: number): number => Math.min(2, Math.max(0.05, Number.isFinite(w) && w > 0 ? w : DEFAULT_WEIGHT));
const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Segments and texts of a DXF in millimetres, y up. */
export function readDxfShapes(text: string): RawShapes {
  const doc = parseDxf(text);
  const notes: string[] = [];
  const assumeMm = doc.insunits === 0;
  if (assumeMm) notes.push('The DXF has no $INSUNITS: its units are read as millimetres.');
  const underlay = convertDxfToUnderlay(doc, 'title block', assumeMm ? { metersPerUnit: 0.001 } : {});
  const segments: RawSegment[] = [];
  const texts: RawText[] = [];
  let turned = 0;
  for (const layer of underlay.layers) {
    if (!layer.visible) continue;
    for (const path of layer.paths) {
      const pts = path.points;
      const weightMm = clampWeight(path.widthMm ?? DEFAULT_WEIGHT);
      const n = path.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        segments.push({ x1: a.x * 1000, y1: a.y * 1000, x2: b.x * 1000, y2: b.y * 1000, weightMm });
      }
    }
    for (const t of layer.texts) {
      if (Math.abs(t.dirY) > 1e-6 || t.dirX < 0) { turned++; continue; }
      texts.push({ x: t.position.x * 1000, y: t.position.y * 1000, height: t.height * 1000, text: t.text, align: t.align, valign: t.valign });
    }
  }
  if (turned > 0) notes.push(`${turned} turned text${turned === 1 ? '' : 's'} left out: the layout's text reads left to right.`);
  const skipped = Object.entries(underlay.skipped).map(([k, n]) => `${n} ${k}`);
  if (skipped.length > 0) notes.push(`Left out, not drawn by the import: ${skipped.join(', ')}.`);
  if (underlay.layers.some((l) => l.fills.length > 0)) notes.push('Filled areas (hatches) are left out: the layout holds lines, rectangles and text.');
  return { segments, texts, notes };
}

/**
 * Raw shapes (millimetres) laid on the block: the top-left corner of their extent on the block's, y turned down when the
 * source has it up, shrunk to fit. Axis-aligned closed boxes become rectangles, repeated segments are kept once.
 */
export function layoutShapes(raw: RawShapes, yUp: boolean): ImportedTitleBlock {
  const notes = [...raw.notes];
  const pts: Array<[number, number]> = [];
  for (const s of raw.segments) pts.push([s.x1, s.y1], [s.x2, s.y2]);
  const texts = raw.texts.filter((t) => t.text.replace(/[{}]/g, '').trim() !== '' && t.height > 0);
  for (const t of texts) pts.push([t.x, t.y]);
  if (pts.length === 0) throw new TitleBlockImportError('The file holds no lines or text to build a title block from.');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [w, h] = [maxX - minX, maxY - minY];
  const k = Math.min(1, TITLE_BLOCK_MM.w / Math.max(w, 1e-9), TITLE_BLOCK_MM.h / Math.max(h, 1e-9));
  if (k < 1) notes.push(`The drawing is ${round(w)} x ${round(h)} mm; it was shrunk to ${round(k * 100)} % to fit the ${TITLE_BLOCK_MM.w} x ${TITLE_BLOCK_MM.h} mm block.`);
  const X = (x: number): number => round((x - minX) * k);
  const Y = (y: number): number => round((yUp ? maxY - y : y - minY) * k);
  const items: TemplateItem[] = [];
  const seen = new Set<string>();
  let n = 0;
  const add = (item: (id: string) => TemplateItem): void => { items.push(item(`imp${++n}`)); };
  const segs = raw.segments.map((s) => ({ x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2), weight: round(clampWeight(s.weightMm)) }))
    .filter((s) => s.x1 !== s.x2 || s.y1 !== s.y2);
  for (const s of segs) {
    const key = [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2), s.x1 === s.x2 || s.y1 === s.y2 ? '' : (s.x1 < s.x2) === (s.y1 < s.y2)].join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    add((id) => ({ id, kind: 'line', ...s }));
  }
  for (const t of texts) {
    const size = round(Math.max(0.1, t.height * k));
    const width = textWidthEm(t.text, false) * size;
    const x = t.align === 'center' ? X(t.x) - width / 2 : t.align === 'right' ? X(t.x) - width : X(t.x);
    const baseline = t.valign === 'top' ? Y(t.y) + size : t.valign === 'middle' ? Y(t.y) + size / 2 : Y(t.y);
    add((id) => ({ id, kind: 'text', x: round(Math.max(0, x)), y: round(baseline), size, text: t.text.replace(/[{}]/g, '').trim().slice(0, MAX_TEXT) }));
  }
  if (items.length > MAX_TEMPLATE_ITEMS) throw new TitleBlockImportError(`The drawing has ${items.length} lines and texts; a title block holds ${MAX_TEMPLATE_ITEMS}. Explode curves and hatches, or simplify the file.`);
  return { template: { items }, size: { w: round(w * k), h: round(h * k) }, shrunkBy: k, notes };
}

/** A title block layout from the text of a DXF file. Throws {@link TitleBlockImportError} when there is nothing to build it from. */
export function importTitleBlockDxf(text: string): ImportedTitleBlock {
  return layoutShapes(readDxfShapes(text), true);
}

/** The names a field can be placed as: the ones the built-in block fills, from the sheet and the title block fields. */
export const PLACEABLE_FIELDS: readonly string[] = [...BUILTIN_PARAMS, ...SOFT_BUILTINS];

export interface PlaceFieldOptions {
  /** Letter height, mm; 3.5 by default. */
  size?: number;
  /** The cell's width, mm: the value shrinks (and wraps, with `lines`/`top`) to stay inside it. */
  fit?: number;
  bold?: boolean;
}

/** The layout with `{field}` placed as a text whose baseline starts at (`x`, `y`) mm from the block's top-left. Throws for a name the block does not fill. */
export function placeField(template: TitleBlockTemplate, field: string, at: { x: number; y: number }, options: PlaceFieldOptions = {}): TitleBlockTemplate {
  if (!PLACEABLE_FIELDS.includes(field)) throw new TitleBlockImportError(`"${field}" is not a title block field. The fields are: ${PLACEABLE_FIELDS.join(', ')}.`);
  if (template.items.length >= MAX_TEMPLATE_ITEMS) throw new TitleBlockImportError(`The layout is full (${MAX_TEMPLATE_ITEMS} items).`);
  const size = options.size ?? 3.5;
  if (![at.x, at.y, size].every(Number.isFinite) || size <= 0 || (options.fit !== undefined && !(options.fit > 0))) throw new TitleBlockImportError('The position, size and width of a field must be numbers above zero.');
  let n = template.items.filter((i) => i.kind === 'text').length;
  while (template.items.some((i) => i.id === `field-${field}-${n}`)) n++;
  const item: TemplateText = { id: `field-${field}-${n}`, kind: 'text', x: at.x, y: at.y, size, text: `{${field}}`, ...(options.bold ? { bold: true } : {}), ...(options.fit !== undefined ? { fit: options.fit } : {}) };
  return { items: [...template.items, item] };
}

/** The fields a layout places, each once, in the order they appear. */
export function placedFields(template: TitleBlockTemplate): string[] {
  const out: string[] = [];
  for (const i of template.items) {
    if (i.kind !== 'text') continue;
    for (const m of i.text.matchAll(/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/g)) if (PLACEABLE_FIELDS.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** A title block layout from the text of an SVG file (limits: `title-block-import-svg.ts`). */
export function importTitleBlockSvg(text: string): ImportedTitleBlock {
  return layoutShapes(readSvgShapes(text), false);
}

/**
 * The layout as a library item a standards pack carries (#365): a pack with the title block alone, so installing it
 * leaves the pens, units and numbering as they are. Its id follows `name`.
 */
export function ownTitleBlockPack(template: TitleBlockTemplate, name: string): StandardPack {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'title-block';
  return {
    id: `title-block-${slug}`, name, version: STANDARD_PACK_VERSION, description: 'An office\'s own title block, imported from a drawing file.',
    titleBlockTemplate: template, notSet: PACK_NOT_SET,
  };
}
