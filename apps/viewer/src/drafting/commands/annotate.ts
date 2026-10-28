/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation commands: TEXT, LEADER, DIMALIGNED, DIMLINEAR, DIMRADIUS,
 * DIMDIAMETER, DIMANGULAR, LEVEL, AXIS and HATCH. Annotations are entities like
 * any drafted geometry, so selection, move / copy / rotate / mirror / erase
 * and undo work on them unchanged.
 */

import { editDrafts, newDraft } from '../draft-store';
import { styledParams } from '@/project/drafting-standards';
import { entitySkeleton, nextAxisLabel } from '../annotation';
import { continueDimension, type DimensionShape } from '../dimension-chain';
import { alignDimensionLine, alignGlyph } from '../dimension-align';
import { anchorParams, encodedAnchorAt } from '../dimension-anchor';
import { orthoGuides, snapLeaderEnd } from '../leader-segments';
import { findPattern } from '../hatch/library';
import { regionAt } from '../hatch/region';
import type { AnnotationShape, AxisShape, DraftParamValue, DraftShape, Pt } from '../types';
import type { DraftCommandDef, DraftContext, StepResult } from './types';
import { dimAngularCommand, dimDiameterCommand, dimRadiusCommand } from './dim-radial';

/** The drafting command that draws a shape. */
export function toolOfShape(shape: AnnotationShape): string {
  switch (shape.type) {
    case 'dimension': return shape.variant === 'linear' ? 'dimlinear' : 'dimaligned';
    case 'radial': return shape.diameter ? 'dimdiameter' : 'dimradius';
    case 'angular': return 'dimangular';
    default: return shape.type;
  }
}

function add(ctx: DraftContext, shape: AnnotationShape, extra: Record<string, string> = {}): void {
  // The current style, and an override when the height was typed differently.
  const params: Record<string, DraftParamValue> = { ...styledParams(ctx.viewId, shape, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle }), ...extra };
  const type = ctx.settings.annotationType;
  if (type && type.tool === toolOfShape(shape)) params.atype = type.id;
  editDrafts({ add: [newDraft(ctx.viewId, ctx.layerId, shape, params)] });
}

const skeleton = (shape: AnnotationShape): DraftShape[] => entitySkeleton(shape);

export const textCommand: DraftCommandDef = {
  id: 'text',
  aliases: ['TEXT', 'T', 'DT', 'MTEXT'],
  labelKey: 'drafting.cmd.text',
  create(ctx) {
    let at: Pt | null = null;
    return {
      prompt: () => ({ key: at ? 'drafting.prompt.enterText' : 'drafting.prompt.textPoint', params: { height: ctx.settings.textHeight } }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        at = p;
        return 'continue';
      },
      wantsValue: () => !at,
      onValue(h) {
        if (h > 0) ctx.settings.textHeight = h;
        return 'continue';
      },
      wantsText: () => at !== null,
      onText(text): StepResult {
        if (at && text) add(ctx, { type: 'text', p: at, text, height: ctx.settings.textHeight, rotation: 0 });
        return 'done';
      },
      preview: (cursor) => (at ? [] : skeleton({ type: 'text', p: cursor, text: 'Text', height: ctx.settings.textHeight, rotation: 0 })),
    };
  },
};

/**
 * LEADER: the arrow point, a bend at any angle, then the end of the second
 * segment (which squares itself near horizontal / vertical, with guides for
 * both), then the text. Enter after the bend makes a one-segment leader.
 */
export const leaderCommand: DraftCommandDef = {
  id: 'leader',
  aliases: ['LEADER', 'LE', 'MLEADER'],
  labelKey: 'drafting.cmd.leader',
  create(ctx) {
    const pts: Pt[] = [];
    let asking = false;
    /** The end of the second segment for a cursor: the one place preview and click agree on. */
    const end = (p: Pt): Pt => snapLeaderEnd(pts[1], p);
    return {
      prompt: () => ({ key: asking ? 'drafting.prompt.enterText' : (['drafting.prompt.leaderTip', 'drafting.prompt.leaderBend', 'drafting.prompt.leaderEnd'] as const)[Math.min(pts.length, 2)] }),
      input: () => 'point',
      basePoint: () => pts.at(-1) ?? null,
      onPoint(p) {
        if (asking) return 'continue';
        pts.push(pts.length === 2 ? end(p) : p);
        if (pts.length === 3) asking = true;
        return 'continue';
      },
      onEnter() {
        if (pts.length < 2) return 'done';
        asking = true;
        return 'continue';
      },
      wantsText: () => asking,
      onText(text) {
        if (pts.length >= 2) add(ctx, { type: 'leader', pts: [...pts], text, height: ctx.settings.textHeight });
        return 'done';
      },
      preview(cursor) {
        if (asking || pts.length === 0) return [];
        if (pts.length === 1) return [{ type: 'polyline', pts: [pts[0], cursor], closed: false }];
        return [{ type: 'polyline', pts: [pts[0], pts[1], end(cursor)], closed: false }, ...orthoGuides(pts[1], cursor, 4 * ctx.settings.textHeight).map((g) => ({ type: 'line' as const, a: g.a, b: g.b }))];
      },
    };
  },
};

/**
 * DIMALIGNED / DIMLINEAR: two points, then where the dimension line goes. By
 * default the command then continues: each further point adds a dimension from
 * the previous end on the same dimension line, until Enter. SINGLE ends it after
 * one dimension, CONTINUOUS (the default) chains.
 */
function linearDim(variant: 'aligned' | 'linear'): DraftCommandDef {
  return {
    id: variant === 'aligned' ? 'dimaligned' : 'dimlinear',
    aliases: variant === 'aligned' ? ['DIMALIGNED', 'DAL', 'DIM'] : ['DIMLINEAR', 'DLI'],
    labelKey: variant === 'aligned' ? 'drafting.cmd.dimAligned' : 'drafting.cmd.dimLinear',
    create(ctx) {
      const pts: Pt[] = [];
      /** The last dimension placed: the chain continues from its end. */
      let last: DimensionShape | null = null;
      /** What each point of the dimension being drawn is attached to (a model element's corner it was snapped to), if anything. */
      const anchors: (string | undefined)[] = [];
      let lastAnchorB: string | undefined;
      const anchorAt = (p: Pt): string | undefined => encodedAnchorAt(p, ctx.elementBoxesAt?.(p) ?? []);
      const shape = (at: Pt): DimensionShape => ({ type: 'dimension', variant, a: pts[0], b: pts[1], at, height: ctx.settings.textHeight });
      /** The dimension line's place for a cursor: aligned to a close existing dimension line (within two text heights). */
      const place = (cursor: Pt) => {
        const existing = ctx.settings.dimAlign ? ctx.entities().flatMap((e) => (e.shape.type === 'dimension' ? [e.shape] : [])) : [];
        return alignDimensionLine(pts[0], pts[1], variant, cursor, existing, 2 * ctx.settings.textHeight);
      };
      return {
        prompt: () => ({ key: last ? 'drafting.prompt.dimNext' : pts.length === 0 ? 'drafting.prompt.dimFirst' : pts.length === 1 ? 'drafting.prompt.dimSecond' : 'drafting.prompt.dimLineAlign' }),
        input: () => 'point',
        basePoint: () => last?.b ?? pts.at(-1) ?? null,
        onKeyword(word) {
          if (word === 'ALIGN') {
            ctx.settings.dimAlign = !ctx.settings.dimAlign;
            ctx.say(ctx.settings.dimAlign ? 'drafting.msg.dimAlignOn' : 'drafting.msg.dimAlignOff');
            return 'continue';
          }
          if (word !== 'SINGLE' && word !== 'CONTINUOUS') return undefined;
          ctx.settings.dimContinuous = word === 'CONTINUOUS';
          return 'continue';
        },
        onPoint(p) {
          if (last) {
            const next = continueDimension(last, p);
            if (next) {
              const anchorB = anchorAt(p);
              add(ctx, next, anchorParams(lastAnchorB, anchorB));
              last = next;
              lastAnchorB = anchorB;
            }
            return 'continue';
          }
          if (pts.length < 2) {
            pts.push(p);
            anchors.push(anchorAt(p));
            return 'continue';
          }
          last = shape(place(p).at);
          lastAnchorB = anchors[1];
          add(ctx, last, anchorParams(anchors[0], anchors[1]));
          return ctx.settings.dimContinuous ? 'continue' : 'done';
        },
        onEnter: () => 'done',
        preview(cursor) {
          if (last) {
            const next = continueDimension(last, cursor);
            return next ? skeleton(next) : [];
          }
          if (pts.length === 1) return [{ type: 'line', a: pts[0], b: cursor }];
          if (pts.length === 2) {
            const aligned = place(cursor);
            return [...skeleton(shape(aligned.at)), ...alignGlyph(aligned, ctx.settings.textHeight)];
          }
          return [];
        },
      };
    },
  };
}

export const dimAlignedCommand = linearDim('aligned');
export const dimLinearCommand = linearDim('linear');

export const levelCommand: DraftCommandDef = {
  id: 'level',
  aliases: ['LEVEL', 'LV', 'SPOTELEVATION'],
  labelKey: 'drafting.cmd.level',
  create(ctx) {
    return {
      prompt: () => ({ key: 'drafting.prompt.levelPoint' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const ref = ctx.levelRefAt(p);
        add(ctx, { type: 'level', p, value: ctx.resolveLevel(ref) ?? ctx.levelAt(p), height: ctx.settings.textHeight, ref });
        return 'continue';
      },
      onEnter: () => 'done',
      preview: (cursor) => skeleton({ type: 'level', p: cursor, value: 0, height: ctx.settings.textHeight }),
    };
  },
};

const AXIS_KEYWORDS: Record<string, (s: DraftContext['settings']) => void> = {
  C: (s) => { s.axisBubble = 'circle'; }, CIRCLE: (s) => { s.axisBubble = 'circle'; },
  S: (s) => { s.axisBubble = 'square'; }, SQUARE: (s) => { s.axisBubble = 'square'; },
  BOTH: (s) => { s.axisEnds = 'both'; }, START: (s) => { s.axisEnds = 'start'; }, END: (s) => { s.axisEnds = 'end'; }, NONE: (s) => { s.axisEnds = 'none'; },
  DASHDOT: (s) => { s.axisLineType = 'dashdot'; }, DASHED: (s) => { s.axisLineType = 'dashed'; },
  DOTTED: (s) => { s.axisLineType = 'dotted'; }, CONTINUOUS: (s) => { s.axisLineType = 'continuous'; },
};

/**
 * AXIS: grid axis lines — two points each, the label in a bubble (circle or
 * square) at the chosen ends, dash-dot by default. Labels count on from one
 * axis to the next (1, 2, 3… or A, B, C…); L types the next label, SIZE a
 * bubble size, C / S the bubble, BOTH / START / END / NONE its ends,
 * DASHDOT / DASHED / DOTTED / CONTINUOUS the line.
 */
export const axisCommand: DraftCommandDef = {
  id: 'axis',
  aliases: ['AXIS', 'AX', 'GRIDLINE'],
  labelKey: 'drafting.cmd.axis',
  create(ctx) {
    const s = ctx.settings;
    let start: Pt | null = null;
    let pending: 'label' | 'size' | null = null;
    const shape = (a: Pt, b: Pt): AxisShape => ({
      type: 'axis', a, b, label: s.axisLabel, bubble: s.axisBubble, ends: s.axisEnds,
      size: s.axisSize ?? s.textHeight * 4, height: s.textHeight, lineType: s.axisLineType,
    });
    return {
      prompt: () => ({
        key: pending === 'label' ? 'drafting.prompt.axisLabel' : pending === 'size' ? 'drafting.prompt.axisSize' : start ? 'drafting.prompt.axisEnd' : 'drafting.prompt.axisStart',
        params: { label: s.axisLabel, bubble: s.axisBubble.toUpperCase(), ends: s.axisEnds.toUpperCase() },
      }),
      input: () => 'point',
      basePoint: () => start,
      onPoint(p) {
        if (!start) {
          start = p;
          return 'continue';
        }
        if (Math.hypot(p.x - start.x, p.y - start.y) < 1e-6) return 'continue';
        add(ctx, shape(start, p));
        s.axisLabel = nextAxisLabel(s.axisLabel);
        start = null;
        return 'continue';
      },
      wantsText: () => pending === 'label',
      onText(text) {
        if (text.trim()) s.axisLabel = text.trim();
        pending = null;
        return 'continue';
      },
      wantsValue: () => pending === 'size',
      onValue(v) {
        if (v > 0) s.axisSize = v;
        pending = null;
        return 'continue';
      },
      onKeyword(word) {
        if (word === 'L' || word === 'LABEL') { pending = 'label'; return 'continue'; }
        if (word === 'SIZE' || word === 'D') { pending = 'size'; return 'continue'; }
        const set = AXIS_KEYWORDS[word];
        if (!set) return undefined;
        set(s);
        return 'continue';
      },
      onEnter() {
        // Enter drops a started axis; a second Enter ends the command.
        if (!start) return 'done';
        start = null;
        return 'continue';
      },
      preview: (cursor) => (start ? skeleton(shape(start, cursor)) : []),
    };
  },
};

export const hatchCommand: DraftCommandDef = {
  id: 'hatch',
  aliases: ['HATCH', 'H', 'BHATCH'],
  labelKey: 'drafting.cmd.hatch',
  create(ctx) {
    let pending: 'scale' | 'angle' = 'scale';
    const s = ctx.settings;
    return {
      prompt: () => ({ key: 'drafting.prompt.hatchPoint', params: { pattern: s.hatchPattern, scale: s.hatchScale, angle: s.hatchAngle } }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const loops = regionAt(p, ctx.closedLoops());
        if (!loops) {
          ctx.say('drafting.msg.noRegion');
          return 'continue';
        }
        add(ctx, { type: 'hatch', loops, pattern: s.hatchPattern, scale: s.hatchScale, angle: s.hatchAngle });
        return 'continue';
      },
      wantsValue: () => true,
      onValue(v) {
        if (pending === 'angle') s.hatchAngle = v;
        else if (v > 0) s.hatchScale = v;
        pending = 'scale';
        return 'continue';
      },
      onKeyword(word) {
        if (word === 'A' || word === 'ANGLE') {
          pending = 'angle';
          return 'continue';
        }
        if (word === 'S' || word === 'SCALE') {
          pending = 'scale';
          return 'continue';
        }
        const pattern = findPattern(word);
        if (!pattern) return undefined;
        s.hatchPattern = pattern.name;
        return 'continue';
      },
      onEnter: () => 'done',
    };
  },
};

export const ANNOTATE_COMMANDS: readonly DraftCommandDef[] = [
  textCommand, leaderCommand, dimAlignedCommand, dimLinearCommand, dimRadiusCommand, dimDiameterCommand,
  dimAngularCommand, levelCommand, axisCommand, hatchCommand,
];
