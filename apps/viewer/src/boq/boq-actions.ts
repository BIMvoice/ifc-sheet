/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities' mapping table as project edits (#75). The table is the project's `boqArticles` (saved with it, carried in a
 * `.bvlib` library); the schedule of kind `boq` is only where it is printed. It starts empty: IfcSheet ships no norm or article code.
 */

import { freshProjectId, newArticle, quantityDimension, unitDimension, BOQ_QUANTITIES, type BoqArticle, type BoqUnit } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { updateSchedule } from '@/joinery/schedules';

const write = (boqArticles: BoqArticle[]): void => useProjectStore.setState({ boqArticles, dirty: true });
const articles = (): BoqArticle[] => useProjectStore.getState().boqArticles ?? [];

/** A blank row at the end of the table; returns its id. */
export function addBoqArticle(unit: BoqUnit = 'm3'): string {
  const id = freshProjectId('boq');
  write([...articles(), newArticle(id, unit)]);
  return id;
}

/** Change fields of an article; `undefined` for an optional field removes it. */
export function updateBoqArticle(id: string, patch: { [K in keyof BoqArticle]?: BoqArticle[K] | undefined }): void {
  write(articles().map((a) => {
    if (a.id !== id) return a;
    const next = { ...a, ...patch } as BoqArticle;
    for (const key of Object.keys(next) as (keyof BoqArticle)[]) if (next[key] === undefined) delete next[key];
    return next;
  }));
}

/**
 * Change an article's unit. Its quantity follows when it no longer fits (the first standard quantity of the new unit), so the usual change of
 * unit is one click; a quantity typed by hand that is not the unit's is replaced, never kept to be refused later by surprise.
 */
export function setBoqUnit(id: string, unit: BoqUnit): void {
  const a = articles().find((x) => x.id === id);
  if (!a) return;
  const fits = quantityDimension(a.quantity) === unitDimension(unit);
  updateBoqArticle(id, { unit, quantity: fits ? a.quantity : (BOQ_QUANTITIES[unitDimension(unit)][0] ?? a.quantity) });
}

export function removeBoqArticle(id: string): void {
  write(articles().filter((a) => a.id !== id));
}

/** Show or hide the rows per type under each article on the schedule. */
export function setBoqDetail(scheduleId: string, on: boolean): void {
  updateSchedule(scheduleId, { detail: on ? true : undefined });
}
