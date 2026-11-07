/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet, or one viewport of it, as SVG (#548): written from the same `SheetGraphic` the PDF and DXF are, so the three agree.
 * Units are paper millimetres from the top-left corner, as the layout has them. Plain strings, no DOM: the file Bonsai's
 * `IfcDocumentReference.Location` names (a drawing's `drawings/<name>.svg`, a sheet's `layouts/<id> - <name>.svg`).
 * Hatches, symbols and the logo's pixels of the app's own sheet are not here (see `sheet-graphic.ts`).
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { Polyline, SheetGraphic, SheetText } from './sheet-graphic.js';

const num = (n: number): string => String(Math.round(n * 1000) / 1000);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const points = (run: Polyline): string => run.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');
const path = (loops: readonly Polyline[]): string => loops.map((l) => `M${l.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}Z`).join('');
const dashed = (dash: readonly number[] | undefined): string => (dash && dash.length > 0 ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : '');

function line(run: Polyline, stroke: string, width: number, extra = ''): string {
  return `<polyline points="${points(run)}" fill="none" stroke="${esc(stroke)}" stroke-width="${num(width)}"${extra}/>`;
}

function text(t: SheetText): string {
  const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
  const family = t.face ? { sans: 'Inter, sans-serif', serif: 'serif', mono: 'monospace' }[t.face.font] : 'Inter, sans-serif';
  const turn = t.angle ? ` transform="rotate(${num(-t.angle)} ${num(t.at.x)} ${num(t.at.y)})"` : '';
  return `<text x="${num(t.at.x)}" y="${num(t.at.y)}" font-size="${num(t.size)}" font-family="${family}" text-anchor="${anchor}"${t.bold ? ' font-weight="bold"' : ''}${t.face?.italic ? ' font-style="italic"' : ''} fill="${esc(t.colour ?? '#000000')}"${turn}>${esc(t.text)}</text>`;
}

/** The sheet as one SVG document, or with `viewId` only that viewport's box: its drawing and nothing of the frame or title block. */
export function exportSvg(sheet: SheetGraphic, options: { viewId?: string } = {}): string {
  const box = options.viewId === undefined ? null : sheet.viewports.find((v) => v.viewId === options.viewId)?.box ?? null;
  if (options.viewId !== undefined && !box) throw new Error(`svg: the sheet ${sheet.number} has no viewport ${options.viewId}`);
  const area = box ?? { x: 0, y: 0, w: sheet.paper.w, h: sheet.paper.h };
  const inside = (p: Point2D): boolean => !box || (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h);
  const out: string[] = [];
  if (!box) for (const f of sheet.frame) out.push(line(f, '#000000', 0.35));
  for (const f of sheet.fills) {
    out.push(`<path d="${path(f.loops)}" fill="${esc(f.colour)}" fill-rule="evenodd" stroke="none"/>`);
    for (const s of f.hatch?.strokes ?? []) out.push(line(s, '#000000', f.hatch?.width ?? 0.13));
  }
  for (const pen of sheet.pens) {
    if (pen.fill !== null) for (const region of pen.regions) out.push(`<path d="${path(region)}" fill="${esc(pen.fill)}" fill-rule="evenodd" stroke="none"/>`);
    if (pen.stroke !== null) for (const r of pen.runs) out.push(line(r, pen.stroke, pen.width, dashed(pen.dash)));
  }
  for (const s of sheet.strokes ?? []) {
    const opacity = s.opacity !== undefined ? ` opacity="${num(s.opacity)}"` : '';
    for (const r of s.runs) {
      out.push(s.fill
        ? `<polygon points="${points(r)}" fill="${esc(s.colour)}" stroke="none"${opacity}/>`
        : line(r, s.colour, s.width, `${dashed(s.dash)}${s.round ? ' stroke-linecap="round"' : ''}${opacity}`));
    }
  }
  for (const r of sheet.symbols.strokes) out.push(line(r, '#000000', 0.18));
  for (const r of sheet.symbols.solids) out.push(`<polygon points="${points(r)}" fill="#000000" stroke="none"/>`);
  for (const r of sheet.marks) out.push(line(r, '#000000', 0.18));
  for (const t of sheet.texts) if (inside(t.at)) out.push(text(t));
  const title = esc(box ? `${sheet.number} ${sheet.name} ${options.viewId}` : `${sheet.number} ${sheet.name}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${num(area.w)}mm" height="${num(area.h)}mm" viewBox="${num(area.x)} ${num(area.y)} ${num(area.w)} ${num(area.h)}">\n<title>${title}</title>\n<rect x="${num(area.x)}" y="${num(area.y)}" width="${num(area.w)}" height="${num(area.h)}" fill="#ffffff"/>\n<g stroke-linejoin="round">\n${out.join('\n')}\n</g>\n</svg>\n`;
}
