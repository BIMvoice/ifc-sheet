/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The site area POT and CUT are measured on (#48), one rule for every table
 * that shows them (the urban indicators schedule and the site plan's balance):
 *
 * 1. a site area typed in the project (`siteArea`) overrides: the area on the
 *    land registry extract can differ from a polygon drawn over the survey;
 * 2. else the plot boundary drawn on the site plan (`plotAreaOf`), so the
 *    ratios follow the plot as it is drawn and redrawn;
 * 3. else the IfcSite GrossArea the model states;
 * 4. else none, and POT and CUT are not given.
 *
 * Every candidate is returned with the one chosen, so a table can say where
 * its site area came from and what a drawn plot measures beside a typed value.
 */

import type { ProjectDocument } from '@/project/types';
import { plotAreaOf } from '@/siteplan/plot';

export type SiteAreaSource = 'typed' | 'plot' | 'model';

export interface SiteAreaChoice {
  /** m², the area POT and CUT are measured on; null when there is none. */
  area: number | null;
  source: SiteAreaSource | null;
  /** m² of the plot boundary drawn on the site plan, null when none is drawn. */
  plot: number | null;
  /** m² typed in the project, null when the field is empty. */
  typed: number | null;
  /** m² of the model's IfcSite, null when it states none. */
  model: number | null;
}

const positive = (v: number | null | undefined): number | null => (v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : null);

/** The site area of `project`, by the rule in the module comment; `modelSiteArea` is the model's IfcSite area. */
export function siteAreaOf(project: Pick<ProjectDocument, 'siteArea' | 'views' | 'drafts'>, modelSiteArea: number | null): SiteAreaChoice {
  const typed = positive(project.siteArea);
  const plot = positive(plotAreaOf(project));
  const model = positive(modelSiteArea);
  const source: SiteAreaSource | null = typed !== null ? 'typed' : plot !== null ? 'plot' : model !== null ? 'model' : null;
  const area = source === 'typed' ? typed : source === 'plot' ? plot : source === 'model' ? model : null;
  return { area, source, plot, typed, model };
}
