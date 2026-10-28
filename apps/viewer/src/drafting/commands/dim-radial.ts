/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMRADIUS, DIMDIAMETER and DIMANGULAR, kept apart from the linear dimensions to hold each module under its size limit. */

import { editDrafts, newDraft } from '../draft-store';
import { styledParams } from '@/project/drafting-standards';
import { dimensionLayout, entitySkeleton } from '../annotation';
import type { AnnotationShape, Pt } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

function add(ctx: DraftContext, shape: AnnotationShape): void {
  const params = styledParams(ctx.viewId, shape, { textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle });
  const type = ctx.settings.annotationType;
  const tool = shape.type === 'radial' ? (shape.diameter ? 'dimdiameter' : 'dimradius') : 'dimangular';
  if (type && type.tool === tool) params.atype = type.id;
  editDrafts({ add: [newDraft(ctx.viewId, ctx.layerId, shape, params)] });
}

const skeleton = entitySkeleton;

/** DIMRADIUS / DIMDIAMETER: pick a circle or arc, then where the label goes. */
function radialDim(diameter: boolean): DraftCommandDef {
  return {
    id: diameter ? 'dimdiameter' : 'dimradius',
    aliases: diameter ? ['DIMDIAMETER', 'DDI'] : ['DIMRADIUS', 'DRA'],
    labelKey: diameter ? 'drafting.cmd.dimDiameter' : 'drafting.cmd.dimRadius',
    create(ctx) {
      let circle: { c: Pt; r: number } | null = null;
      const shape = (at: Pt): AnnotationShape => ({ type: 'radial', c: (circle as { c: Pt }).c, r: (circle as { r: number }).r, at, diameter, height: ctx.settings.textHeight });
      return {
        prompt: () => ({ key: circle ? 'drafting.prompt.dimLine' : 'drafting.prompt.pickCircle' }),
        input: () => (circle ? 'point' : 'pick'),
        basePoint: () => circle?.c ?? null,
        onPick(entity) {
          if (entity.shape.type === 'circle' || entity.shape.type === 'arc') circle = { c: entity.shape.c, r: entity.shape.r };
          else ctx.say('drafting.msg.pickCircle');
          return 'continue';
        },
        onPoint(p) {
          if (!circle) return 'continue';
          add(ctx, shape(p));
          return 'done';
        },
        preview: (cursor) => (circle ? skeleton(shape(cursor)) : []),
      };
    },
  };
}

export const dimRadiusCommand = radialDim(false);
export const dimDiameterCommand = radialDim(true);

export const dimAngularCommand: DraftCommandDef = {
  id: 'dimangular',
  aliases: ['DIMANGULAR', 'DAN'],
  labelKey: 'drafting.cmd.dimAngular',
  create(ctx) {
    const pts: Pt[] = [];
    const shape = (at: Pt): AnnotationShape => ({ type: 'angular', c: pts[0], a: pts[1], b: pts[2], at, height: ctx.settings.textHeight });
    return {
      prompt: () => ({ key: ['drafting.prompt.angleVertex', 'drafting.prompt.angleFirst', 'drafting.prompt.angleSecond', 'drafting.prompt.dimLine'][pts.length] as 'drafting.prompt.dimLine' }),
      input: () => 'point',
      basePoint: () => pts[0] ?? null,
      onPoint(p) {
        if (pts.length < 3) {
          pts.push(p);
          return 'continue';
        }
        add(ctx, shape(p));
        return 'done';
      },
      preview(cursor) {
        if (pts.length === 1 || pts.length === 2) return [{ type: 'polyline', pts: [...pts.slice(1), pts[0], cursor].slice(-3), closed: false }];
        if (pts.length === 3) return dimensionLayout(shape(cursor) as Extract<AnnotationShape, { type: 'angular' }>).lines.map((l) => ({ type: 'line' as const, a: l.a, b: l.b }));
        return [];
      },
    };
  },
};
