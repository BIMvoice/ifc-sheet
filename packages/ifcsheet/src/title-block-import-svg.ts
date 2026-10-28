/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A title block from an SVG (#458), into the same raw shapes the DXF gives (`title-block-import.ts`), so the two are
 * laid on the block alike. Kept simple, and these are the limits:
 *  - read: `line`, `rect`, `polyline`, `polygon`, `path` (M L H V Z, absolute and relative) and `text` (its own text, a
 *    `tspan`'s joined), with `x`/`y`, `font-size`, `stroke-width` and `text-anchor` as attributes;
 *  - the root's `viewBox` sets the scale: with a `width` in mm, cm, in, pt or px the viewBox maps to that size, without one
 *    a user unit is a millimetre (said in the notes);
 *  - not read, and counted in the notes: CSS (`<style>`, the `style` attribute), `transform` (the shape is kept
 *    untransformed), curves in a path (drawn as the straight chord to their end), groups' inherited attributes, `use`,
 *    images, gradients, clip paths, rotated text; fills are ignored, shapes are outlines.
 */

import { TitleBlockImportError, type RawShapes } from './title-block-import-shapes.js';

const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] ?? m[3] ?? '';
  return out;
}
const num = (v: string | undefined, fallback = 0): number => {
  const n = v === undefined ? NaN : Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const unescape = (s: string): string => s.replace(/&(?:amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));

/** Path data to polylines (user units); curves become their chord. Returns the subpaths and whether a curve was met. */
function pathPoints(d: string): { runs: Array<{ pts: Array<[number, number]>; closed: boolean }>; curved: boolean } {
  const runs: Array<{ pts: Array<[number, number]>; closed: boolean }> = [];
  let cur: { pts: Array<[number, number]>; closed: boolean } | null = null;
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let curved = false;
  for (const m of d.matchAll(/([MmLlHhVvZzCcSsQqTtAa])([^MmLlHhVvZzCcSsQqTtAa]*)/g)) {
    const cmd = m[1];
    const a = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const move = (nx: number, ny: number): void => { [x, y] = [nx, ny]; cur?.pts.push([x, y]); };
    switch (cmd.toUpperCase()) {
      case 'M':
        for (let i = 0; i + 1 < a.length; i += 2) {
          [x, y] = rel ? [x + a[i], y + a[i + 1]] : [a[i], a[i + 1]];
          if (i === 0) { cur = { pts: [[x, y]], closed: false }; runs.push(cur); [sx, sy] = [x, y]; } else cur?.pts.push([x, y]);
        }
        break;
      case 'L': for (let i = 0; i + 1 < a.length; i += 2) move(rel ? x + a[i] : a[i], rel ? y + a[i + 1] : a[i + 1]); break;
      case 'H': for (const v of a) move(rel ? x + v : v, y); break;
      case 'V': for (const v of a) move(x, rel ? y + v : v); break;
      case 'Z': if (cur) { cur.closed = true; [x, y] = [sx, sy]; } break;
      default: {
        // C, S, Q, T take 6, 4, 4, 2 numbers a segment, A takes 7: the end point is the last two (A: the two before the flags are not read).
        const per = { C: 6, S: 4, Q: 4, T: 2, A: 7 }[cmd.toUpperCase() as 'C'];
        curved = true;
        for (let i = 0; i + per <= a.length; i += per) move(rel ? x + a[i + per - 2] : a[i + per - 2], rel ? y + a[i + per - 1] : a[i + per - 1]);
      }
    }
  }
  return { runs, curved };
}

/** Segments and texts of an SVG in millimetres, y down. */
export function readSvgShapes(svg: string): RawShapes {
  const root = /<svg\b[^>]*>/i.exec(svg);
  if (!root) throw new TitleBlockImportError('Not an SVG file: there is no <svg> element.');
  const r = attrs(root[0]);
  const notes: string[] = [];
  const vb = (r.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const hasBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0;
  const widthUnit = /^\s*[\d.]+\s*([a-z]*)\s*$/i.exec(r.width ?? '')?.[1].toLowerCase();
  const widthMm = r.width !== undefined && widthUnit !== undefined && (widthUnit === '' ? 'px' : widthUnit) in MM_PER ? num(r.width) * MM_PER[widthUnit === '' ? 'px' : widthUnit] : undefined;
  let k = 1; // millimetres a user unit
  if (hasBox && widthMm !== undefined && widthMm > 0) k = widthMm / vb[2];
  else notes.push('The SVG states no size in mm, cm, in, pt or px: one drawing unit is read as one millimetre.');
  const [ox, oy] = hasBox ? [vb[0], vb[1]] : [0, 0];
  const body = svg.slice(root.index + root[0].length);
  if (/<style\b/i.test(body) || /\sstyle\s*=/i.test(body)) notes.push('CSS (a <style> element or style attributes) is not read: pens and sizes come from attributes, else defaults.');
  const transforms = (body.match(/\stransform\s*=/gi) ?? []).length;
  if (transforms > 0) notes.push(`${transforms} transform${transforms === 1 ? '' : 's'} not applied: those shapes sit untransformed.`);
  const X = (v: number): number => (v - ox) * k;
  const Y = (v: number): number => (v - oy) * k;
  const out: RawShapes = { segments: [], texts: [], notes };
  const seg = (x1: number, y1: number, x2: number, y2: number, w: Record<string, string>): void => {
    out.segments.push({ x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), weightMm: num(w['stroke-width'], 0.25 / k) * k });
  };
  const run = (pts: Array<[number, number]>, closed: boolean, a: Record<string, string>): void => {
    for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], a);
    if (closed && pts.length > 2) seg(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], a);
  };
  let curves = 0;
  for (const m of body.matchAll(/<(line|rect|polyline|polygon|path)\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[2]);
    switch (m[1].toLowerCase()) {
      case 'line': seg(num(a.x1), num(a.y1), num(a.x2), num(a.y2), a); break;
      case 'rect': {
        const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
        if (w > 0 && h > 0) run([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, a);
        break;
      }
      case 'path': {
        const { runs, curved } = pathPoints(a.d ?? '');
        if (curved) curves++;
        for (const p of runs) run(p.pts, p.closed, a);
        break;
      }
      default: {
        const v = (a.points ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
        const pts: Array<[number, number]> = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        run(pts, m[1].toLowerCase() === 'polygon', a);
      }
    }
  }
  if (curves > 0) notes.push(`${curves} path${curves === 1 ? '' : 's'} with curves: each curve is drawn as the straight line to its end.`);
  let turned = 0;
  for (const m of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const a = attrs(m[1]);
    if (/rotate/i.test(a.transform ?? '')) { turned++; continue; }
    const text = unescape(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const anchor = a['text-anchor'];
    out.texts.push({ x: X(num(a.x)), y: Y(num(a.y)), height: num(a['font-size'], 3.5 / k) * k, text, align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', valign: 'baseline' });
  }
  if (turned > 0) notes.push(`${turned} rotated text${turned === 1 ? '' : 's'} left out: the layout's text reads left to right.`);
  return out;
}
