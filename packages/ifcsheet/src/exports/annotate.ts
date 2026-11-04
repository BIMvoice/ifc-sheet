/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Annotate the set" as plain functions (#707): which commands run on which kind of view, and the annotation presets. Add new exports of this area here, not in `../index.ts`. */

export { ALL_CHOICES, COMMAND_ORDER, choicesFrom, choicesOfTemplate, commandsFor, hasChoices, type AnnotateChoices, type AnnotateCommand, type AnnotatedKind } from '../annotate/choices.js';
export { effectiveOptions, readAnnotationPresets, withPreset, withoutPreset, type AnnotationOptions, type AnnotationPreset } from '../annotate/presets.js';
