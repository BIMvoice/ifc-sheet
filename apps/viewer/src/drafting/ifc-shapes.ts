/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted entity as the lines and texts an IFC annotation holds (#82): the geometry of the drawing, not its look. The same layouts
 * the sheet draws from (`dimensionLayout`, `axisLayout`, `textBox`, `placeSymbol`), so a dimension carries the figure and ticks the
 * sheet prints, with every point lifted to the IFC's world plan by `toWorld` (the view's plane and the render-frame offset).
 *
 * Plan views only: the text boxes are measured with the plan's screen-up (drawing y points down the screen), and in the world plan
 * a text's baseline runs along a right-handed frame. Not written: hatches (a fill, not a line), the frame round a boxed text and an
 * arrow's fill; the pen, colour and font are the sheet's and an IFC annotation has no place for them without styles. Returns
 * `null` for a hatch so the caller can count what it left out.
 */

import type { DrawnCurve, DrawnText, Pt2 } from '@bimvoice/ifcsheet/annotated-ifc';
import { liveSymbol, flattenShape, placeSymbol } from '@bimvoice/ifcsheet';
import { axisLayout, dimensionLayout, formatLevel, textBox, textLeader, withAnnotationScreenUp } from './annotation';
import { leaderTextRight } from './leader-segments';
import { witnessLine } from './level-mark';
import { formatDimension, type DimStyle, type TextStyle } from './styles';
import { textBlock } from './text-block';
import { isGeometry, type EntityShape, type Pt } from './types';

export interface IfcShapeContext {
  /** A point of the view's drawing as the IFC's world plan point, metres. */
  toWorld: (p: Pt) => Pt2;
  locale: string;
  look: { text: TextStyle; dim: DimStyle };
  /** Drawing metres per paper millimetre (`view.scale / 1000`). */
  paperUnit: number;
}

export interface IfcShapes { curves: DrawnCurve[]; texts: DrawnText[] }

const EPS = 1e-9;
const unit = (v: Pt2): Pt2 => {
  const l = Math.hypot(v.x, v.y);
  return l > EPS ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};

/** The shapes of `shape` on a plan, or `null` for one that has no line to write (a hatch). */
export function ifcShapesOf(shape: EntityShape, ctx: IfcShapeContext): IfcShapes | null {
  if (!isGeometry(shape) && shape.type === 'hatch') return null;
  return withAnnotationScreenUp(-1, () => build(shape, ctx));
}

function build(shape: EntityShape, ctx: IfcShapeContext): IfcShapes {
  const out: IfcShapes = { curves: [], texts: [] };
  const w = ctx.toWorld;
  const line = (pts: readonly Pt[], closed = false) => { if (pts.length >= 2) out.curves.push({ type: 'polyline', points: pts.map(w), closed }); };
  const circle = (c: Pt, r: number) => out.curves.push({ type: 'circle', centre: w(c), radius: r });

  /** A text whose first baseline starts at `p`, turned `rotation` (drawing, radians). */
  const text = (p: Pt, value: string, height: number, rotation: number) => {
    if (!value.trim()) return;
    const [bl, br] = textBox(p, value, height, rotation);
    const block = textBlock(value, height, undefined, ctx.look.text);
    out.texts.push({ position: w(bl), direction: unit({ x: w(br).x - w(bl).x, y: w(br).y - w(bl).y }), text: value, width: block.box.x1, height: block.box.y1 - block.box.y0 });
  };

  /** An arrow end at `tip`, its barbs swept back along `-dir` (drawing). */
  const arrow = (kind: DimStyle['arrow'], tip: Pt, dir: Pt, size: number) => {
    const ang = Math.atan2(dir.y, dir.x);
    if (kind === 'none' || size <= 0) return;
    if (kind === 'dot') { circle(tip, size * 0.3); return; }
    if (kind === 'arrow') {
      const back = (da: number): Pt => ({ x: tip.x - size * Math.cos(ang + da), y: tip.y - size * Math.sin(ang + da) });
      line([back(0.3), tip, back(-0.3)]);
      return;
    }
    const h = size * 0.5;
    const c = Math.cos(ang + Math.PI / 4) * h;
    const s = Math.sin(ang + Math.PI / 4) * h;
    line([{ x: tip.x - c, y: tip.y - s }, { x: tip.x + c, y: tip.y + s }]);
  };

  if (isGeometry(shape)) {
    switch (shape.type) {
      case 'line': line([shape.a, shape.b]); break;
      case 'polyline': line(shape.pts, shape.closed); break;
      case 'circle': circle(shape.c, shape.r); break;
      case 'arc': { const f = flattenShape(shape); line(f.pts, f.closed); break; }
    }
    return out;
  }

  const dim = ctx.look.dim;
  const arrowSize = dim.arrowSize * ctx.paperUnit;
  switch (shape.type) {
    case 'text': {
      text(shape.p, shape.text, shape.height, shape.rotation);
      const lead = textLeader(shape);
      if (lead) { line([lead.from, lead.tip]); arrow('arrow', lead.tip, { x: lead.tip.x - lead.from.x, y: lead.tip.y - lead.from.y }, arrowSize * 1.2); }
      break;
    }
    case 'leader': {
      line(shape.pts);
      const [tip, next] = [shape.pts[0], shape.pts[1] ?? shape.pts[0]];
      arrow('arrow', tip, { x: tip.x - next.x, y: tip.y - next.y }, arrowSize * 1.2);
      const end = shape.pts[shape.pts.length - 1];
      const right = leaderTextRight(shape.pts, 1);
      const width = textBlock(shape.text, shape.height, undefined, ctx.look.text).box.x1;
      // The text starts just past the end of the last segment, level with it (the sheet shifts its baseline down by 0.35 of its height).
      const gap = shape.height * 0.3;
      text({ x: right ? end.x + gap : end.x - gap - width, y: end.y + shape.height * 0.35 }, shape.text, shape.height, 0);
      break;
    }
    case 'level': {
      const h = shape.height;
      line([shape.p, { x: shape.p.x - h, y: shape.p.y - h }, { x: shape.p.x + h, y: shape.p.y - h }], true);
      line([{ x: shape.p.x - h, y: shape.p.y }, { x: shape.p.x + h * 5, y: shape.p.y }]);
      const witness = witnessLine(shape);
      if (witness) line([witness.a, shape.p]);
      text({ x: shape.p.x + h * 1.3, y: shape.p.y - h * 1.15 }, formatLevel(ctx.locale, shape.value), h, 0);
      break;
    }
    case 'axis': {
      line([shape.a, shape.b]);
      const { bubbles, r } = axisLayout(shape);
      const width = textBlock(shape.label, shape.height, undefined, ctx.look.text).box.x1;
      for (const c of bubbles) {
        if (shape.bubble === 'circle') circle(c, r);
        else line([{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }], true);
        text({ x: c.x - width / 2, y: c.y + shape.height * 0.35 }, shape.label, shape.height, 0);
      }
      break;
    }
    case 'symbol': {
      const { def, at } = liveSymbol(shape, null);
      if (!def) break;
      const placed = placeSymbol(def, at, -1);
      for (const g of placed.geometry) {
        if (g.type === 'circle') circle(g.c, g.r);
        else if (g.type === 'line') line([g.a, g.b]);
        else { const f = flattenShape(g); line(f.pts, f.closed); }
      }
      for (const t of placed.texts) text(t.p, t.text, t.height, t.rotation);
      break;
    }
    case 'dimension':
    case 'radial':
    case 'angular': {
      const layout = dimensionLayout(shape, {
        extGap: dim.extGap * ctx.paperUnit,
        extOver: dim.extOver * ctx.paperUnit,
        format: (m) => formatDimension(ctx.locale, m, dim),
        locale: ctx.locale,
      });
      for (const l of layout.lines) line([l.a, l.b]);
      for (const t of layout.ticks) arrow(dim.arrow, t.at, t.dir, arrowSize);
      // The figure reads left to right (bottom to top on a vertical line), above the line unless the style puts it on or under it.
      const at = w(layout.textAt);
      const ahead = w({ x: layout.textAt.x + Math.cos(layout.textAngle), y: layout.textAt.y + Math.sin(layout.textAngle) });
      let along = unit({ x: ahead.x - at.x, y: ahead.y - at.y });
      if (along.x < -1e-6 || (Math.abs(along.x) <= 1e-6 && along.y < 0)) along = { x: -along.x, y: -along.y };
      const above = { x: -along.y, y: along.x };
      const block = textBlock(layout.label, shape.height, undefined, ctx.look.text);
      const lift = dim.placement === 'centered' ? -shape.height * 0.35 : dim.placement === 'below' ? -(dim.textGap * ctx.paperUnit + shape.height * 0.8) : dim.textGap * ctx.paperUnit;
      out.texts.push({
        position: { x: at.x - along.x * (block.box.x1 / 2) + above.x * lift, y: at.y - along.y * (block.box.x1 / 2) + above.y * lift },
        direction: along, text: layout.label, width: block.box.x1, height: block.box.y1 - block.box.y0,
      });
      break;
    }
    default:
      break;
  }
  return out;
}
