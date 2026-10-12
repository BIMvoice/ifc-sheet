/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LABEL: place the current parametric label type on a model element — click
 * the element; its label is offered beside it (Enter takes that place, a click
 * puts it elsewhere). LABELALL: place it on every element of a class the view
 * draws that has none of this type yet, each beside its element and clear of
 * the others (`labels/label-layout.ts`); the class is picked from those in the
 * view, or typed. Both need a label annotation type (the Standards
 * dialog, Annotation types) set as the current one; the labels then follow
 * their elements (`labels/label-sync.ts`).
 */

import type { AnnotationType } from '@/catalogue/types';
import { classesOf, planTagAll, type LabelTarget } from '@/labels/label-place';
import { defaultCentres, labelDraft, labelTargets, type LabelPlacement } from '@/labels/label-all';
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { entitySkeleton } from '../annotation';
import { editDrafts } from '../draft-store';
import type { Pt } from '../types';
import type { DraftCommandDef, DraftContext } from './types';

/** The label type the settings name, or null (none chosen, or it is gone or no longer a label type). */
function currentLabelType(ctx: DraftContext): AnnotationType | null {
  const id = ctx.settings.annotationType?.id;
  const type = id ? (useProjectStore.getState().annotationTypes ?? []).find((t) => t.id === id) : undefined;
  return type?.tool === 'label' && type.label ? type : null;
}

const placement = (ctx: DraftContext): LabelPlacement => ({
  viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle, paperUnit: paperUnitOf(ctx.viewId),
});

/** A cursor this near the element picked (paper millimetres) has not been moved yet: the label shows at its default place. */
const STILL_MM = 2;

export const labelCommand: DraftCommandDef = {
  id: 'label',
  aliases: ['LABEL', 'LB', 'PLABEL'],
  labelKey: 'drafting.cmd.label',
  create(ctx) {
    // The element picked, and where its label goes beside it unless the next click says otherwise.
    let picked: { target: LabelTarget; at: Pt; type: AnnotationType } | null = null;
    const place = (centre: Pt): 'continue' => {
      if (!picked) return 'continue';
      const draft = labelDraft(picked.type, picked.target.guid, centre, placement(ctx), picked.target.ring);
      if (draft) editDrafts({ add: [draft] });
      picked = null;
      return 'continue';
    };
    return {
      prompt: () => ({ key: picked ? 'drafting.prompt.labelPosition' : 'drafting.prompt.labelElement' }),
      input: () => 'point',
      basePoint: () => picked?.target.anchor ?? null,
      onPoint(p) {
        if (picked) return place(p);
        const type = currentLabelType(ctx);
        if (!type) {
          ctx.say('drafting.msg.labelNeedsType');
          return 'done';
        }
        const id = ctx.elementAt(p);
        const elements = ctx.viewElements();
        const target = id === null ? undefined : labelTargets(elements).find((t) => t.renderId === id);
        const at = target ? defaultCentres(type, [target], elements, ctx.entities(), placement(ctx)).get(target.guid) : undefined;
        if (!target || !at) {
          ctx.say('drafting.msg.notAnElement');
          return 'continue';
        }
        picked = { target, at, type };
        return 'continue';
      },
      onEnter() {
        if (!picked) return 'done';
        return place(picked.at);
      },
      preview(cursor) {
        if (!picked) return [];
        const still = Math.hypot(cursor.x - picked.target.anchor.x, cursor.y - picked.target.anchor.y) < STILL_MM * paperUnitOf(ctx.viewId);
        const draft = labelDraft(picked.type, picked.target.guid, still ? picked.at : cursor, placement(ctx), picked.target.ring);
        return draft ? entitySkeleton(draft.shape) : [];
      },
    };
  },
};

/** The class a typed name means among the classes in the view: `IfcWall`, `Wall` and `wall` all do. */
function classNamed(text: string, classes: readonly string[]): string | undefined {
  const wanted = text.trim().toLowerCase();
  return classes.find((c) => c.toLowerCase() === wanted || c.toLowerCase() === `ifc${wanted}`);
}

export const labelAllCommand: DraftCommandDef = {
  id: 'labelall',
  aliases: ['LABELALL', 'TAGALL', 'LBA'],
  labelKey: 'drafting.cmd.labelAll',
  create(ctx) {
    const elements = ctx.viewElements();
    const targets = labelTargets(elements);
    const classes = classesOf(targets);
    const run = (className: string): 'done' => {
      const type = currentLabelType(ctx);
      if (!type) {
        ctx.say('drafting.msg.labelNeedsType');
        return 'done';
      }
      const plan = planTagAll(targets, className, type.id, ctx.entities());
      const at = placement(ctx);
      const centres = defaultCentres(type, plan, elements, ctx.entities(), at);
      const drafts = plan.flatMap((t) => labelDraft(type, t.guid, centres.get(t.guid) ?? t.anchor, at, t.ring) ?? []);
      if (drafts.length) editDrafts({ add: drafts });
      ctx.say(drafts.length ? 'drafting.msg.labelAllDone' : 'drafting.msg.labelAllNone', { count: drafts.length, class: className });
      return 'done';
    };
    return {
      prompt: () => ({ key: 'drafting.prompt.labelAllClass', choices: classes.map((c) => ({ value: c.className, count: c.count })) }),
      input: () => 'point',
      basePoint: () => null,
      wantsText: () => true,
      onText(text) {
        const className = classNamed(text, classes.map((c) => c.className));
        if (!className) {
          ctx.say('drafting.msg.labelAllClass', { class: text });
          return 'continue';
        }
        return run(className);
      },
      onEnter() {
        if (classes.length === 1) return run(classes[0].className);
        ctx.say(classes.length ? 'drafting.msg.labelAllPick' : 'drafting.msg.labelAllEmpty');
        return 'continue';
      },
    };
  },
};
