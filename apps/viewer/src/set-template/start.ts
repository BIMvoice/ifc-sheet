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
import type { AxisBounds } from '@/lib/section/section-distance';
import { annotateSet, type AnnotateRun } from '@/annotate-set/annotate-set';
import { choicesOfTemplate, hasChoices } from '@/annotate-set/choices';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { applyExtras, applyNumbering } from './apply';
import { takeArmedTemplate, useSetTemplates } from './store';

/**
 * `startDrawingSet`, by the armed template if there is one. Returns whether it laid a set out. The commands the template records
 * (TAGALL, DIMALL, LEVELALL) then run on the new set's views through the batch behind "Annotate the set" (#333), each on its own
 * drawing as the drawings are made; like the set, they are the project's starting state, not an undo step.
 */
export function startSet(meshes: MeshData[] | null, bounds: AxisBounds | null, annotate?: Pick<AnnotateRun, 'drawingOf'>): boolean {
  const template = bounds ? takeArmedTemplate() : null;
  if (!template) return startDrawingSet(meshes, bounds);
  applyNumbering(template);
  const laid = startDrawingSet(meshes, bounds, {
    rules: template,
    extras: (report) => {
      const notes = [...report.notes.filter((n) => n.key.startsWith('setTemplate.')), ...applyExtras(template)];
      useSetTemplates.setState({ report: { template: template.name, notes, annotated: null } });
    },
  });
  const choices = choicesOfTemplate(template);
  if (laid && hasChoices(choices)) {
    useSetTemplates.setState((s) => ({ report: s.report && { ...s.report, annotated: 'running' } }));
    void annotateSet({ choices, mode: 'starting', ...annotate })
      .then((summary) => useSetTemplates.setState((s) => ({ report: s.report && { ...s.report, annotated: summary } })))
      .catch((error: unknown) => {
        console.warn('[ifcsheet] the template\'s annotation commands could not be run', error);
        useSetTemplates.setState((s) => ({ report: s.report && { ...s.report, annotated: null } }));
      });
  }
  return laid;
}
