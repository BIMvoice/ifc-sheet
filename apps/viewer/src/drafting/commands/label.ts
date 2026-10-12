/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LABEL: place the current parametric label type on a model element — click
 * the element, the label's centre goes there. LABELALL: place it on every
 * element of a class the view draws that has none of this type yet, each at
 * the centre of its outline. Both need a label annotation type (the Standards
 * dialog, Annotation types) set as the current one; the labels then follow
 * their elements (`labels/label-sync.ts`).
 */

import type { AnnotationType } from '@/catalogue/types';
import { classesOf, planTagAll } from '@/labels/label-place';
import { labelDraft, labelTargets } from '@/labels/label-all';
import { renderIdGlobalId } from '@/project/element-guid';
import { useProjectStore } from '@/project/project-store';
import { editDrafts } from '../draft-store';
import type { DraftCommandDef, DraftContext } from './types';

/** The label type the settings name, or null (none chosen, or it is gone or no longer a label type). */
function currentLabelType(ctx: DraftContext): AnnotationType | null {
  const id = ctx.settings.annotationType?.id;
  const type = id ? (useProjectStore.getState().annotationTypes ?? []).find((t) => t.id === id) : undefined;
  return type?.tool === 'label' && type.label ? type : null;
}

const placement = (ctx: DraftContext) => ({
  viewId: ctx.viewId, layerId: ctx.layerId, textHeight: ctx.settings.textHeight, textStyle: ctx.settings.currentTextStyle, dimStyle: ctx.settings.currentDimStyle,
});

export const labelCommand: DraftCommandDef = {
  id: 'label',
  aliases: ['LABEL', 'LB', 'PLABEL'],
  labelKey: 'drafting.cmd.label',
  create(ctx) {
    return {
      prompt: () => ({ key: 'drafting.prompt.labelElement' }),
      input: () => 'point',
      basePoint: () => null,
      onPoint(p) {
        const type = currentLabelType(ctx);
        if (!type) {
          ctx.say('drafting.msg.labelNeedsType');
          return 'done';
        }
        const id = ctx.elementAt(p);
        const guid = id === null ? null : renderIdGlobalId(id);
        const draft = guid ? labelDraft(type, guid, p, placement(ctx)) : null;
        if (!draft) {
          ctx.say('drafting.msg.notAnElement');
          return 'continue';
        }
        editDrafts({ add: [draft] });
        return 'continue';
      },
      onEnter: () => 'done',
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
    const targets = labelTargets(ctx.viewElements());
    const classes = classesOf(targets);
    const run = (className: string): 'done' => {
      const type = currentLabelType(ctx);
      if (!type) {
        ctx.say('drafting.msg.labelNeedsType');
        return 'done';
      }
      const drafts = planTagAll(targets, className, type.id, ctx.entities()).flatMap((t) => labelDraft(type, t.guid, t.anchor, placement(ctx)) ?? []);
      if (drafts.length) editDrafts({ add: drafts });
      ctx.say(drafts.length ? 'drafting.msg.labelAllDone' : 'drafting.msg.labelAllNone', { count: drafts.length, class: className });
      return 'done';
    };
    return {
      prompt: () => ({ key: 'drafting.prompt.labelAllClass', params: { classes: classes.map((c) => `${c.className} (${c.count})`).join(', ') || '-' } }),
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
