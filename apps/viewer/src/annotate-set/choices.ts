/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which commands run on which kind of view (#333): the choices live in the engine (#707); the app adds the labels. */

import { ALL_CHOICES, COMMAND_ORDER, choicesFrom, choicesOfTemplate, commandsFor, hasChoices, type AnnotateChoices, type AnnotateCommand, type AnnotatedKind } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '@/i18n';

export { ALL_CHOICES, COMMAND_ORDER, choicesFrom, choicesOfTemplate, commandsFor, hasChoices };
export type { AnnotateChoices, AnnotateCommand, AnnotatedKind };

export const COMMAND_LABEL: Record<AnnotateCommand, TranslationKey> = { tagall: 'drafting.cmd.tagAll', dimall: 'drafting.cmd.dimAll', levelall: 'drafting.cmd.levelAll' };
