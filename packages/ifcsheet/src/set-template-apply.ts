/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A set template applied to a model's views (#21): the sheets it describes,
 * found by rule, laid out by the automatic set's own functions (`placeViewports`,
 * `scaleOn`, `setRows`, `numberSheets`). The one place both the Wall and the
 * command line make a templated set; `buildDrawingSet` is its counterpart when
 * there is no template.
 *
 *   - A rule that finds no view (no third storey) makes no slot and is reported.
 *   - A sheet whose slots all found nothing is not made.
 *   - A view no rule foresaw, in a series the template has sheets for, is laid
 *     out as the automatic set lays it out, on the paper, frame and scale of
 *     the series' last sheet in the template, after that sheet.
 *   - A view in a series the template has no sheet for is left unhung, and said.
 */

import { drawingArea, fitsScale, groupOfView, placeViewports, scaleOn, setRows, viewExtent, type ModelExtent } from './drawing-set.js';
import type { NumberingScheme, ProjectSheet, ProjectView, SheetViewport } from './document.js';
import { freshProjectId } from './ids.js';
import { DEFAULT_SCHEME, numberSheets } from './numbering.js';
import { findAllByRule, ruledViews, RULED_SERIES, type RuledSeries, type SetTemplate, type SheetLayoutRule, type SheetRule, type ViewRule } from './set-template.js';
import type { TemplateNote } from './set-template-notes.js';
import { rescaledNote, steppedUpNote } from './sheet-notes.js';

export interface TemplateSetInput {
  views: readonly ProjectView[];
  extent: ModelExtent;
  now?: number;
  scheme?: NumberingScheme;
  /** The language the notes printed on the sheets are written in ("ro", "en"); default English. */
  locale?: string;
}

export interface TemplateSet {
  sheets: ProjectSheet[];
  notes: TemplateNote[];
}

const SERIES_OF_GROUP = (view: ProjectView): RuledSeries | null => {
  const group = groupOfView(view);
  return group === 'plans' || group === 'elevations' || group === 'sections' ? group : null;
};

const startOf = (layout: SheetLayoutRule): Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId'> => ({
  paper: layout.paper, orientation: layout.orientation, ...(layout.frame ? { frame: layout.frame } : {}), ...(layout.templateId ? { templateId: layout.templateId } : {}),
});

/**
 * The paper a sheet starts on: the layout's own when `sizes` fit it at `wanted`, else the first of its `stepUp` papers
 * they fit at `wanted` (the scale is never changed to save paper), else the largest of them. A stepped-up sheet drops
 * the built-in sheet template id, which belongs to the paper it was made for.
 */
function paperFor(layout: SheetLayoutRule, sizes: readonly { w: number; h: number }[], wanted: number | undefined): ReturnType<typeof startOf> {
  const start = startOf(layout);
  const steps = layout.stepUp ?? [];
  if (wanted === undefined || steps.length === 0 || fitsScale(sizes, drawingArea(start), wanted)) return start;
  const { templateId: _own, ...bare } = start;
  const stepped = steps.map((paper) => ({ ...bare, paper }));
  return stepped.find((s) => fitsScale(sizes, drawingArea(s), wanted)) ?? stepped[stepped.length - 1];
}

/** The scale a group of slots asks for: the least detailed of them, as the sheet draws all its views at one scale. */
const wantedScale = (scales: readonly (number | undefined)[]): number | undefined => {
  const given = scales.filter((s): s is number => s !== undefined);
  return given.length > 0 ? Math.max(...given) : undefined;
};

function skippedNote(sheet: string, rule: ViewRule): TemplateNote {
  if (rule.kind === 'site') return { key: 'setTemplate.note.skipped.site', params: { sheet, place: (rule.nth ?? 0) + 1 } };
  if (rule.kind === 'allPlans') return { key: 'setTemplate.note.skipped.plan', params: { sheet, storey: '*' } };
  if (rule.kind === 'plan') return { key: 'setTemplate.note.skipped.plan', params: { sheet, storey: rule.storey > 0 ? `+${rule.storey}` : rule.storey } };
  if (rule.kind === 'section') return { key: 'setTemplate.note.skipped.section', params: { sheet, place: rule.place + 1 } };
  return { key: 'setTemplate.note.skipped.elevation', params: { sheet, direction: rule.direction } };
}

/** One sheet of the template made out of the views its rules found; null when none was found. */
function sheetOf(rule: SheetRule, views: readonly ProjectView[], claimed: Set<string>, input: TemplateSetInput, notes: TemplateNote[]): ProjectSheet | null {
  const members: ProjectView[] = [];
  const scales: (number | undefined)[] = [];
  for (const slot of rule.slots) {
    const found = findAllByRule(slot.view, views);
    // A rule for every storey, or for the FIRST site plan, finding none says nothing: the first asked for no particular one, and the
    // second finds none only when the model has no storey to cut it on, which the missing plans already say. A rule for a FURTHER
    // site plan (`nth`) finding none is a sheet the template wanted and the project cannot give: said, never dropped silently.
    if (found.length === 0 && slot.view.kind !== 'allPlans' && (slot.view.kind !== 'site' || (slot.view.nth ?? 0) > 0)) notes.push(skippedNote(rule.name, slot.view));
    for (const view of found) {
      if (claimed.has(view.id)) continue;
      claimed.add(view.id);
      members.push(view);
      scales.push(slot.scale);
    }
  }
  if (members.length === 0) return null;
  const sizes = members.map((v) => viewExtent(v, input.extent));
  const wanted = wantedScale(scales);
  const start = paperFor(rule.layout, sizes, wanted);
  const scale = scaleOn(sizes, start, wanted);
  if (wanted !== undefined && scale !== wanted) notes.push({ key: 'setTemplate.note.rescaled', params: { sheet: rule.name, wanted, used: scale } });
  const viewports: SheetViewport[] = placeViewports(members, sizes, scale, start, input.extent);
  // Said on the sheet itself as well: a person holding the paper cannot see the report.
  const printed: string[] = [...(rule.notes ?? [])];
  if (wanted !== undefined && typeof start.paper === 'string' && typeof rule.layout.paper === 'string' && start.paper !== rule.layout.paper) printed.push(steppedUpNote(input.locale, rule.layout.paper, start.paper, wanted));
  if (wanted !== undefined && scale !== wanted && typeof start.paper === 'string') printed.push(rescaledNote(input.locale, start.paper, wanted, scale));
  return { id: freshProjectId('sheet'), number: '', series: rule.series, name: rule.name, createdAt: input.now ?? Date.now(), ...start, viewports, ...(printed.length > 0 ? { notes: printed } : {}) };
}

/**
 * The sheets `template` makes of `input.views`, numbered by the scheme (the template's, else `input.scheme`, else the
 * default), and what the person should know about how the rules met this model.
 */
export function applySetTemplate(template: SetTemplate, input: TemplateSetInput): TemplateSet {
  const notes: TemplateNote[] = [];
  const claimed = new Set<string>();
  const made = template.sheets.map((rule) => ({ rule, sheet: sheetOf(rule, input.views, claimed, input, notes) }));
  const sheets: ProjectSheet[] = [];
  const lastOf = new Map<RuledSeries, SheetRule>();
  for (const { rule, sheet } of made) {
    if (sheet) sheets.push(sheet);
    lastOf.set(rule.series, rule);
  }

  // What no rule foresaw is laid out the way the automatic set lays it out, on the last sheet rule of its series.
  const loose = ruledViews(input.views).filter((v) => !claimed.has(v.id));
  for (const series of RULED_SERIES) {
    const own = loose.filter((v) => SERIES_OF_GROUP(v) === series);
    if (own.length === 0) continue;
    const last = lastOf.get(series);
    const layout = setRows(own);
    const names = layout.flatMap((r) => r.members.map((v) => v.name)).join(', ');
    if (!last) {
      notes.push({ key: 'setTemplate.note.unplaced', params: { series, names } });
      continue;
    }
    notes.push({ key: 'setTemplate.note.defaulted', params: { series, names } });
    const start = startOf(last.layout);
    const wanted = wantedScale(last.slots.map((s) => s.scale));
    const extra = layout.map(({ name, members }): ProjectSheet => {
      const sizes = members.map((v) => viewExtent(v, input.extent));
      return {
        id: freshProjectId('sheet'), number: '', series, name, createdAt: input.now ?? Date.now(), ...start,
        viewports: placeViewports(members, sizes, scaleOn(sizes, start, wanted), start, input.extent),
      };
    });
    // After the series' last sheet; at the end when every one of its sheets found nothing.
    let at = sheets.length;
    sheets.forEach((s, i) => { if (s.series === series) at = i + 1; });
    sheets.splice(at, 0, ...extra);
  }

  const numbers = numberSheets(sheets, template.numbering ?? input.scheme ?? DEFAULT_SCHEME);
  return { sheets: sheets.map((s) => ({ ...s, number: numbers.get(s.id) ?? s.number })), notes };
}
