/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheet templates: the paper, orientation, frame margins and title block
 * position a sheet starts from. A few are built in; the project keeps its own
 * (saved from a sheet), and they travel in the library file. A series of the
 * set (plans, details…) can name the template its new sheets start from.
 */

import { readFrame, DEFAULT_FRAME } from './sheet-frame';
import { readPaper } from './paper';
import type { ProjectSheet, SheetTemplate, TemplateSeries } from './types';
import { freshProjectId } from './view-defaults';

/** The filing margin on the left that ISO 5457 asks of a drawing sheet, mm (the other three sides keep the standard 10). */
export const FILING_MARGIN_MM = 20;

const frame = (titleBlock: SheetTemplate['frame']['titleBlock'] = 'bottom-right') =>
  ({ margins: { ...DEFAULT_FRAME.margins, left: FILING_MARGIN_MM }, titleBlock });

/** The templates every project has, each with the filing margin. Ids start with `builtin:`; names are what the person reads. */
export const BUILT_IN_TEMPLATES: readonly SheetTemplate[] = [
  { id: 'builtin:a1-plans', name: 'A1 plans', paper: 'A1', orientation: 'landscape', frame: frame() },
  { id: 'builtin:a3-details', name: 'A3 details', paper: 'A3', orientation: 'landscape', frame: frame() },
  { id: 'builtin:a2-elevations-long', name: 'A2 elevations long', paper: { kind: 'elongated', base: 'A2', factor: 3 }, orientation: 'landscape', frame: frame() },
  { id: 'builtin:a3-schedules', name: 'A3 schedules', paper: 'A3', orientation: 'landscape', frame: frame('right') },
];

/** Built-in templates, then the project's own. */
export const allTemplates = (own: readonly SheetTemplate[] = []): SheetTemplate[] => [...BUILT_IN_TEMPLATES, ...own];

export const findTemplate = (id: string | undefined, own: readonly SheetTemplate[] = []): SheetTemplate | undefined =>
  id === undefined ? undefined : allTemplates(own).find((t) => t.id === id);

/** What a sheet takes from a template (its paper, orientation, frame, and where it came from). */
export function templateFields(t: SheetTemplate): Pick<ProjectSheet, 'paper' | 'orientation' | 'frame' | 'templateId'> {
  return { paper: t.paper, orientation: t.orientation, frame: t.frame, templateId: t.id };
}

/** A project template made of how `sheet` is set up now. */
export function templateFromSheet(sheet: Pick<ProjectSheet, 'paper' | 'orientation' | 'frame'>, name: string): SheetTemplate {
  return { id: freshProjectId('template'), name, paper: sheet.paper ?? 'A1', orientation: sheet.orientation ?? 'landscape', frame: sheet.frame ?? DEFAULT_FRAME };
}

/** A template out of a file; undefined when it is not one. */
export function readTemplate(v: unknown): SheetTemplate | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const paper = readPaper(o.paper);
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim() || !paper) return undefined;
  return { id: o.id, name: o.name, paper, orientation: o.orientation === 'portrait' ? 'portrait' : 'landscape', frame: readFrame(o.frame) ?? DEFAULT_FRAME };
}

const SERIES: readonly TemplateSeries[] = ['plans', 'elevations', 'sections', 'schedules', 'details'];

/** Which template each series starts from, out of a file; unknown series and non-text ids are dropped. */
export function readSeriesTemplates(v: unknown): Partial<Record<TemplateSeries, string>> {
  if (typeof v !== 'object' || v === null) return {};
  const o = v as Record<string, unknown>;
  return Object.fromEntries(SERIES.flatMap((s) => (typeof o[s] === 'string' ? [[s, o[s]]] : [])));
}
