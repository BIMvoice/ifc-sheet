/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's start with a set template (#21): when a template is armed, the
 * model's set is made by its rules and the rest of the template is applied, all
 * as the project's starting state (no undo step, as the automatic set is none).
 * Without an armed template this is the automatic start, unchanged.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { ANNOTATION_COMMANDS, type SetTemplate } from '@bimvoice/ifcsheet';
import type { AxisBounds } from '@/lib/section/section-distance';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { applyExtras, applyNumbering } from './apply';
import { takeArmedTemplate, useSetTemplates } from './store';

/** The annotation commands the template asks for, by series: the app runs them on a view when it is open (they read the drawn view), so they are listed, not run. */
export function commandsToRun(template: SetTemplate): { series: string; commands: string[] }[] {
  return Object.entries(template.annotations).map(([series, commands]) => ({ series, commands: ANNOTATION_COMMANDS.filter((c) => commands?.includes(c)) }));
}

/** `startDrawingSet`, by the armed template if there is one. Returns whether it laid a set out. */
export function startSet(meshes: MeshData[] | null, bounds: AxisBounds | null): boolean {
  const template = bounds ? takeArmedTemplate() : null;
  if (!template) return startDrawingSet(meshes, bounds);
  applyNumbering(template);
  return startDrawingSet(meshes, bounds, {
    rules: template,
    extras: (report) => {
      const notes = [...report.notes.filter((n) => n.key.startsWith('setTemplate.')), ...applyExtras(template)];
      useSetTemplates.setState({ report: { template: template.name, notes, toRun: commandsToRun(template) } });
    },
  });
}
