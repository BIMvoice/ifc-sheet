/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the viewport card changes about a view's colour scheme (#92), and the legend made for it. Plain functions on the project
 * store, so the card, a command and a test all take the same path; each change is one undo step.
 */

import { schemeTitle, type ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { addLegend, placeLegend, projectLegends, updateLegend } from '@/legend/legend-actions';
import type { LegendLabels } from '@/legend/legend-layout';
import type { ProjectLegend } from '@/catalogue/types';
import { updateProjectView, useProjectStore } from './project-store';
import type { ProjectView, ViewGraphics } from './types';

const viewOf = (viewId: string): ProjectView | undefined => useProjectStore.getState().views.find((v) => v.id === viewId);

function write(viewId: string, scheme: ColourScheme | undefined): void {
  const view = viewOf(viewId);
  if (!view) return;
  const { colourScheme: _old, ...rest } = view.graphics ?? {};
  const graphics: ViewGraphics = scheme ? { ...rest, colourScheme: scheme } : rest;
  updateProjectView(viewId, { graphics });
}

/** Colour a view by `scheme`; `null` takes the colouring off (the legend made for it stays, empty, until it is removed). */
export function setColourScheme(viewId: string, scheme: ColourScheme | null): void {
  const before = viewOf(viewId)?.graphics?.colourScheme;
  write(viewId, scheme ?? undefined);
  // The legend made for the view carries the property's name; it follows when the property changes.
  const legend = colourLegendOf(viewId);
  if (legend && scheme && before && legend.title === schemeTitle(before.property) && before.property !== scheme.property) updateLegend(legend.id, { title: schemeTitle(scheme.property) });
}

/**
 * Change part of a view's scheme. A new property or target starts the values over (the hand-set colours belong to the values of the
 * old property); a field set to `undefined` is taken off.
 */
export function patchColourScheme(viewId: string, patch: Partial<ColourScheme>): void {
  const scheme = viewOf(viewId)?.graphics?.colourScheme;
  if (!scheme) return;
  const next: ColourScheme = { ...scheme, ...patch };
  if (patch.property !== undefined && patch.property !== scheme.property) delete next.colours;
  if (patch.target !== undefined && patch.target !== scheme.target) { delete next.colours; delete next.classes; }
  for (const key of ['classes', 'colours', 'palette', 'title'] as const) if (key in patch && patch[key] === undefined) delete next[key];
  setColourScheme(viewId, next);
}

/** Set the colour of a value by hand, or (`null`) give it back to the palette. `key` is the value's key (`valueKey`). */
export function setValueColour(viewId: string, key: string, colour: string | null): void {
  const scheme = viewOf(viewId)?.graphics?.colourScheme;
  if (!scheme) return;
  const { [key]: _gone, ...rest } = scheme.colours ?? {};
  const colours = colour ? { ...rest, [key]: colour.toLowerCase() } : rest;
  patchColourScheme(viewId, { colours: Object.keys(colours).length > 0 ? colours : undefined });
}

/** The legend made for a view's colours: one scoped to the view that lists only them. */
export function colourLegendOf(viewId: string): ProjectLegend | undefined {
  return projectLegends().find((l) => l.scope === 'view' && l.scopeId === viewId && l.categories.length === 1 && l.categories[0] === 'colours');
}

/**
 * Put the legend of a view's colours on `sheetId`: the one already made for the view, else a new one, placed through the
 * ordinary legend placement (a free place clear of what the sheet holds, `placeLegend`). Returns the viewport's id; `null` when the
 * view has no scheme, the sheet is gone, or the legend is already on the sheet.
 */
export function addColourLegend(sheetId: string, viewId: string, labels: LegendLabels): string | null {
  const scheme = viewOf(viewId)?.graphics?.colourScheme;
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === sheetId);
  if (!scheme || !sheet) return null;
  let legend = colourLegendOf(viewId);
  if (legend && sheet.viewports?.some((vp) => vp.viewId === legend!.id)) return null;
  const id = legend?.id ?? addLegend(schemeTitle(scheme.property), { scope: 'view', scopeId: viewId, categories: ['colours'], headings: false });
  legend = projectLegends().find((l) => l.id === id);
  return legend ? placeLegend(sheetId, legend.id, labels) : null;
}
