/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A legend laid out on paper (millimetres, y down): a title over a frame of
 * rows, each a swatch and a name, flowed into columns. A swatch is what the
 * thing looks like in a drawing — a material's hatch and fill (or its
 * membrane line), a layer's pen, a hatch pattern, a symbol, the sample of an
 * annotation type. Pure: the screen, sheets, SVG and DXF all draw these
 * primitives.
 */

import type { AnnotationType, DraftSymbol, LegendConfig } from '@/catalogue/types';
import { hatchSegments } from '@/drafting/hatch/fill';
import { findPattern } from '@/drafting/hatch/library';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { flattenShape, placeSymbol } from '@/drafting/symbols';
import type { FontKind, TextStyle } from '@/drafting/styles';
import type { Pt } from '@/drafting/types';
import type { LegendEntry, LegendGroup } from './legend-data';

export type LegendPrim =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color?: string; dash?: boolean }
  | { kind: 'path'; pts: Pt[]; closed?: boolean; w: number; color?: string; fill?: string; dash?: boolean }
  | { kind: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; bold?: boolean; font?: FontKind };

export interface LegendLayout {
  width: number;
  height: number;
  prims: LegendPrim[];
}

export interface LegendLabels {
  /** The category headings. */
  heading: Record<LegendGroup['category'], string>;
  /** A category's heading when its list carries on in the next column. */
  continued: (heading: string) => string;
  /** What a membrane and an annotation tool are called in an entry's text. */
  tool: (tool: AnnotationType['tool']) => string;
  membrane: string;
  sampleText: string;
}

export interface LegendLayoutContext {
  textStyle: TextStyle;
  /** The project's own hatch patterns. */
  patterns: readonly HatchPattern[];
  labels: LegendLabels;
}

const PAD = 4;
const GAP = 3;
const GUTTER = 8;
const INK = '#000000';
const HATCH_PEN = 0.13;
const FRAME_PEN = 0.35;

const textWidth = (text: string, size: number, bold = false) => text.length * size * (bold ? 0.62 : 0.56);

interface Item {
  kind: 'heading' | 'entry';
  category: LegendGroup['category'];
  height: number;
  label: string;
  entry?: LegendEntry;
}

function entryLabel(e: LegendEntry, labels: LegendLabels): string {
  return e.category === 'annotations' ? `${e.name} (${labels.tool(e.type.tool)})` : e.category === 'materials' && e.membrane && !e.hatch ? `${e.name} (${labels.membrane})` : e.name;
}

/** Items flowed into at most `columns` columns of near-equal height; a heading never ends a column. */
function flow(items: readonly Item[], columns: number): Item[][] {
  const n = Math.max(1, Math.min(columns, items.length));
  const total = items.reduce((s, i) => s + i.height, 0);
  const target = total / n;
  const out: Item[][] = [[]];
  let h = 0;
  for (const item of items) {
    const col = out[out.length - 1];
    if (col.length > 0 && out.length < n && h + item.height / 2 > target + 1e-9) {
      const carry = col[col.length - 1]?.kind === 'heading' ? col.pop() : undefined;
      out.push(carry ? [carry] : []);
      h = carry ? carry.height : 0;
    }
    out[out.length - 1].push(item);
    h += item.height;
  }
  return out;
}

export function layoutLegend(groups: readonly LegendGroup[], config: LegendConfig, ctx: LegendLayoutContext): LegendLayout {
  const { textStyle, labels } = ctx;
  const size = textStyle.height;
  const rowH = Math.max(config.rowHeight, size * 1.6);
  const swatchW = config.swatchWidth;
  const headingSize = size * 1.15;
  const titleSize = Math.max(size * 1.8, 4);
  const headingItem = (category: LegendGroup['category'], label: string): Item => ({ kind: 'heading', category, height: rowH * 0.85, label });
  const items: Item[] = groups.flatMap((g) => [
    ...(config.headings ? [headingItem(g.category, labels.heading[g.category])] : []),
    ...g.entries.map((entry): Item => ({ kind: 'entry', category: g.category, height: rowH, label: entryLabel(entry, labels), entry })),
  ]);
  const columns = flow(items, config.columns);
  // A category that runs on into the next column says so there.
  if (config.headings) {
    columns.forEach((col, i) => {
      const first = col[0];
      const before = columns[i - 1]?.at(-1);
      if (first?.kind === 'entry' && before?.kind === 'entry' && before.category === first.category) col.unshift(headingItem(first.category, labels.continued(labels.heading[first.category])));
    });
  }
  const widths = columns.map((col) => Math.max(
    swatchW + GAP + 24,
    ...col.map((i) => (i.kind === 'heading' ? textWidth(i.label, headingSize, true) : swatchW + GAP + textWidth(i.label, size))),
  ));
  const title = config.showTitle ? config.title : '';
  const titleH = title ? titleSize * 2 : 0;
  const bodyW = widths.reduce((s, w) => s + w, 0) + GUTTER * Math.max(0, widths.length - 1);
  const width = Math.max(PAD * 2 + bodyW, title ? PAD * 2 + textWidth(title, titleSize, true) : 0, 40);
  const bodyH = Math.max(0, ...columns.map((c) => c.reduce((s, i) => s + i.height, 0)));
  const height = PAD * 2 + titleH + Math.max(bodyH, rowH);
  const prims: LegendPrim[] = [{ kind: 'path', pts: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], closed: true, w: FRAME_PEN, color: INK }];
  if (title) {
    prims.push({ kind: 'text', x: PAD, y: PAD + titleSize * 1.15, text: title, size: titleSize, anchor: 'start', bold: true, font: textStyle.font });
    prims.push({ kind: 'line', x1: 0, y1: PAD + titleH - titleSize * 0.2, x2: width, y2: PAD + titleH - titleSize * 0.2, w: FRAME_PEN * 0.7, color: INK });
  }
  let x = PAD;
  columns.forEach((col, ci) => {
    let y = PAD + titleH;
    for (const item of col) {
      if (item.kind === 'heading') {
        prims.push({ kind: 'text', x, y: y + item.height * 0.72, text: item.label, size: headingSize, anchor: 'start', bold: true, font: textStyle.font });
      } else if (item.entry) {
        prims.push({ kind: 'line', x1: x, y1: y, x2: x + widths[ci], y2: y, w: HATCH_PEN, color: '#a1a1aa' });
        const box = { x: x + 0.5, y: y + 1, w: swatchW - 1, h: item.height - 2 };
        swatch(prims, item.entry, box, ctx);
        prims.push({ kind: 'text', x: x + swatchW + GAP, y: y + item.height / 2 + size * 0.35, text: item.label, size, anchor: 'start', bold: textStyle.bold, font: textStyle.font });
      }
      y += item.height;
    }
    x += widths[ci] + GUTTER;
  });
  return { width, height, prims };
}

// ─── Swatches ─────────────────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }

const rect = (b: Box): Pt[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];

const DASH_TYPES = new Set(['dashed', 'dotted', 'dashdot']);

/** A hatch pattern in a box, as outline plus pattern lines (a solid pattern fills it). */
function hatchSwatch(out: LegendPrim[], b: Box, patternName: string, scale: number, ctx: LegendLayoutContext, fill?: string): void {
  const pattern = findPattern(patternName, ctx.patterns);
  out.push({ kind: 'path', pts: rect(b), closed: true, w: 0.25, color: INK, ...(fill ? { fill } : pattern?.solid ? { fill: INK } : {}) });
  if (!pattern || pattern.solid) return;
  const { segments } = hatchSegments([rect(b)], pattern, { scale, angleDeg: 0, maxSegments: 4000 });
  for (const s of segments) {
    out.push(s.a.x === s.b.x && s.a.y === s.b.y
      ? { kind: 'line', x1: s.a.x, y1: s.a.y, x2: s.a.x + 0.15, y2: s.a.y, w: HATCH_PEN * 2, color: INK }
      : { kind: 'line', x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, w: HATCH_PEN, color: INK });
  }
}

function swatch(out: LegendPrim[], e: LegendEntry, b: Box, ctx: LegendLayoutContext): void {
  const midY = b.y + b.h / 2;
  switch (e.category) {
    case 'materials':
      if (e.hatch) hatchSwatch(out, b, e.hatch, e.hatchScale, ctx, e.fill ?? undefined);
      else if (e.membrane) out.push({ kind: 'line', x1: b.x, y1: midY, x2: b.x + b.w, y2: midY, w: 0.7, color: INK, dash: true });
      else out.push({ kind: 'path', pts: rect(b), closed: true, w: 0.25, color: INK, ...(e.fill ? { fill: e.fill } : {}) });
      if (e.hatch && e.membrane) out.push({ kind: 'line', x1: b.x, y1: midY, x2: b.x + b.w, y2: midY, w: 0.7, color: INK, dash: true });
      break;
    case 'layers':
      out.push({ kind: 'line', x1: b.x, y1: midY, x2: b.x + b.w, y2: midY, w: Math.max(e.weight, 0.1), color: e.color, ...(DASH_TYPES.has(e.lineType) ? { dash: true } : {}) });
      break;
    case 'hatches':
      hatchSwatch(out, b, e.name, e.scale, ctx);
      break;
    case 'symbols':
      symbolSwatch(out, e.symbol, b);
      break;
    case 'annotations':
      annotationSwatch(out, e.type, b, ctx);
      break;
  }
}

/** A symbol upright and fitted to the box, centred; text at least 1.2 mm. */
function symbolSwatch(out: LegendPrim[], symbol: DraftSymbol, b: Box): void {
  const placed = placeSymbol(symbol, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 }, -1);
  const paths = placed.geometry.map((g) => flattenShape(g));
  const xs = [...paths.flatMap((p) => p.pts.map((q) => q.x)), ...placed.texts.flatMap((t) => [t.p.x, t.p.x + textWidth(t.text, t.height)])];
  const ys = [...paths.flatMap((p) => p.pts.map((q) => q.y)), ...placed.texts.flatMap((t) => [t.p.y, t.p.y - t.height])];
  if (xs.length === 0) return;
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9);
  const k = Math.min(b.w / w, b.h / h);
  const ox = b.x + (b.w - w * k) / 2 - x0 * k;
  const oy = b.y + (b.h - h * k) / 2 - y0 * k;
  for (const p of paths) out.push({ kind: 'path', pts: p.pts.map((q) => ({ x: ox + q.x * k, y: oy + q.y * k })), closed: p.closed, w: 0.18, color: INK });
  for (const t of placed.texts) out.push({ kind: 'text', x: ox + t.p.x * k, y: oy + t.p.y * k, text: t.text, size: Math.max(t.height * k, 1.2), anchor: 'start' });
}

/** A small sample of what an annotation type draws. */
function annotationSwatch(out: LegendPrim[], type: AnnotationType, b: Box, ctx: LegendLayoutContext): void {
  const { x, y, w, h } = b;
  const midY = y + h / 2;
  const small = Math.min(ctx.textStyle.height * 0.9, h * 0.5);
  const line = (x1: number, y1: number, x2: number, y2: number, pen = 0.18, dash = false): void => { out.push({ kind: 'line', x1, y1, x2, y2, w: pen, color: INK, ...(dash ? { dash } : {}) }); };
  const text = (tx: number, ty: number, s: string, anchor: 'start' | 'middle' | 'end' = 'start'): void => { out.push({ kind: 'text', x: tx, y: ty, text: s, size: small, anchor }); };
  const arrow = (tx: number, ty: number, dx: number, dy: number): void => {
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    out.push({ kind: 'path', pts: [{ x: tx, y: ty }, { x: tx + ux * 2 - uy * 0.7, y: ty + uy * 2 + ux * 0.7 }, { x: tx + ux * 2 + uy * 0.7, y: ty + uy * 2 - ux * 0.7 }], closed: true, w: 0.1, color: INK, fill: INK });
  };
  switch (type.tool) {
    case 'text':
      text(x + 1, midY + small * 0.35, ctx.labels.sampleText);
      break;
    case 'leader':
    case 'tag':
      line(x + 1, y + h - 1, x + w * 0.45, midY);
      arrow(x + 1, y + h - 1, 1, -1);
      line(x + w * 0.45, midY, x + w * 0.55, midY);
      text(x + w * 0.58, midY + small * 0.35, type.tool === 'tag' ? '01' : 'Abc');
      break;
    case 'dimaligned':
    case 'dimlinear':
      line(x + 1, midY, x + w - 1, midY);
      for (const tx of [x + 1, x + w - 1]) { line(tx, midY - h * 0.35, tx, midY + h * 0.35); line(tx - 0.8, midY + 0.8, tx + 0.8, midY - 0.8, 0.3); }
      text(x + w / 2, midY - 0.8, '2.50', 'middle');
      break;
    case 'dimradius':
    case 'dimdiameter': {
      const r = Math.min(h * 0.38, w * 0.2);
      const cx = x + w * 0.3;
      out.push({ kind: 'path', pts: Array.from({ length: 24 }, (_, i) => ({ x: cx + r * Math.cos((i / 24) * Math.PI * 2), y: midY + r * Math.sin((i / 24) * Math.PI * 2) })), closed: true, w: 0.18, color: INK });
      line(type.tool === 'dimdiameter' ? cx - r : cx, midY, cx + r + 4, midY - h * 0.2);
      text(cx + r + 5, midY - h * 0.2 + small * 0.35, type.tool === 'dimdiameter' ? 'Ø' : 'R');
      break;
    }
    case 'dimangular': {
      const [cx, cy] = [x + w * 0.25, y + h - 1];
      line(cx, cy, cx + w * 0.5, cy);
      line(cx, cy, cx + w * 0.4, cy - h * 0.75);
      out.push({ kind: 'path', pts: Array.from({ length: 8 }, (_, i) => ({ x: cx + w * 0.3 * Math.cos((-i / 7) * 1.1), y: cy + w * 0.3 * Math.sin((-i / 7) * 1.1) })), w: 0.18, color: INK });
      break;
    }
    case 'level':
      out.push({ kind: 'path', pts: [{ x: x + 3, y: midY + 1 }, { x: x + 1, y: midY - 1.2 }, { x: x + 5, y: midY - 1.2 }], closed: true, w: 0.18, color: INK, fill: INK });
      line(x + 0.5, midY + 1, x + w * 0.5, midY + 1);
      text(x + w * 0.52, midY + 0.5, '±0.00');
      break;
    case 'axis': {
      const axis = type.axis ?? { bubble: 'circle', ends: 'both', size: null, lineType: 'dashdot' };
      const r = Math.min(h * 0.4, 3);
      const [lx0, lx1] = [x + (axis.ends === 'both' || axis.ends === 'start' ? 2 * r + 1 : 1), x + w - (axis.ends === 'both' || axis.ends === 'end' ? 2 * r + 1 : 1)];
      line(lx0, midY, lx1, midY, 0.25, axis.lineType !== 'continuous');
      const bubble = (cx: number): void => {
        out.push(axis.bubble === 'square'
          ? { kind: 'path', pts: [{ x: cx - r, y: midY - r }, { x: cx + r, y: midY - r }, { x: cx + r, y: midY + r }, { x: cx - r, y: midY + r }], closed: true, w: 0.25, color: INK }
          : { kind: 'path', pts: Array.from({ length: 20 }, (_, i) => ({ x: cx + r * Math.cos((i / 20) * Math.PI * 2), y: midY + r * Math.sin((i / 20) * Math.PI * 2) })), closed: true, w: 0.25, color: INK });
        out.push({ kind: 'text', x: cx, y: midY + small * 0.3, text: '1', size: small, anchor: 'middle' });
      };
      if (axis.ends === 'both' || axis.ends === 'start') bubble(x + r + 0.5);
      if (axis.ends === 'both' || axis.ends === 'end') bubble(x + w - r - 0.5);
      break;
    }
    case 'hatch':
      hatchSwatch(out, b, type.hatch?.pattern ?? 'LINES45', type.hatch?.scale ?? 1, ctx);
      break;
  }
}

