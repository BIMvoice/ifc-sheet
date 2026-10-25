/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotating the set (#333): which one-action commands run on which kind of
 * view. TAGALL and DIMALL are for plans, LEVELALL for elevations and sections;
 * a set template (#21) records the same choice per series of views.
 */

import type { AnnotationCommand, SetTemplate } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '@/i18n';
import type { ProjectView } from '@/project/types';

/** The commands, by their id in the drafting registry. */
export type AnnotateCommand = 'tagall' | 'dimall' | 'levelall';

/** The kinds of view a command can run on. */
export type AnnotatedKind = 'plan' | 'elevation' | 'section';

/** The commands to run on each kind of view. */
export type AnnotateChoices = Record<AnnotatedKind, readonly AnnotateCommand[]>;

/** Every command on every kind it is made for: what "Annotate the set" starts with. */
export const ALL_CHOICES: AnnotateChoices = { plan: ['tagall', 'dimall'], elevation: ['levelall'], section: ['levelall'] };

/** TAGALL before DIMALL, as one types them: DIMALL keeps its strings clear of the tags already there. */
export const COMMAND_ORDER: readonly AnnotateCommand[] = ['tagall', 'dimall', 'levelall'];

export const COMMAND_LABEL: Record<AnnotateCommand, TranslationKey> = { tagall: 'drafting.cmd.tagAll', dimall: 'drafting.cmd.dimAll', levelall: 'drafting.cmd.levelAll' };

/** The choice with these three switches: TAGALL and DIMALL for plans, LEVELALL for elevations and sections. */
export function choicesFrom(on: Record<AnnotateCommand, boolean>): AnnotateChoices {
  const pick = (kind: AnnotatedKind) => ALL_CHOICES[kind].filter((c) => on[c]);
  return { plan: pick('plan'), elevation: pick('elevation'), section: pick('section') };
}

const TEMPLATE_NAME: Record<AnnotationCommand, AnnotateCommand> = { tagAll: 'tagall', dimAll: 'dimall', levelAll: 'levelall' };
const TEMPLATE_SERIES: Record<AnnotatedKind, 'plans' | 'elevations' | 'sections'> = { plan: 'plans', elevation: 'elevations', section: 'sections' };

/** What a set template records per series of views, as a choice. */
export function choicesOfTemplate(template: Pick<SetTemplate, 'annotations'>): AnnotateChoices {
  const of = (kind: AnnotatedKind) => {
    const asked = (template.annotations[TEMPLATE_SERIES[kind]] ?? []).map((c) => TEMPLATE_NAME[c]);
    return ALL_CHOICES[kind].filter((c) => asked.includes(c));
  };
  return { plan: of('plan'), elevation: of('elevation'), section: of('section') };
}

export const hasChoices = (choices: AnnotateChoices): boolean => choices.plan.length + choices.elevation.length + choices.section.length > 0;

/** The commands that run on `view`, in order (none for a view of another kind). */
export function commandsFor(view: Pick<ProjectView, 'kind'>, choices: AnnotateChoices): readonly AnnotateCommand[] {
  const kind = view.kind;
  if (kind !== 'plan' && kind !== 'elevation' && kind !== 'section') return [];
  return COMMAND_ORDER.filter((c) => choices[kind].includes(c));
}
