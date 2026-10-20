/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writes to the title block's layout (#143). Nothing is stored until the
 * layout is first edited: until then every sheet prints the standard layout
 * in the language of the day. Each edit refuses a value that would draw
 * nothing sensible (a number that is not one, a pen or a letter height that
 * is not positive) and leaves the item as it was.
 */

import { useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';
import { ITEM_KINDS, type TemplateItem, type TitleBlockTemplate } from './title-block-template';

const MAX_ITEMS = 500;
export const MAX_TEXT = 200;

/** The numeric fields an item has, and whether zero or less is allowed. */
const NUMBERS: Record<TemplateItem['kind'], Record<string, boolean>> = {
  line: { x1: true, y1: true, x2: true, y2: true, weight: false },
  rect: { x: true, y: true, w: false, h: false, weight: false },
  text: { x: true, y: true, size: false, fit: false },
  logo: { x: true, y: true, w: false, h: false },
};

const current = (): TitleBlockTemplate | undefined => useProjectStore.getState().titleBlockTemplate;

function write(template: TitleBlockTemplate | undefined): void {
  useProjectStore.setState({ titleBlockTemplate: template, dirty: true });
}

/** The layout, applied to every text it holds (a parameter renamed). */
export function renameInTemplate(template: TitleBlockTemplate, change: (text: string) => string): TitleBlockTemplate {
  return { items: template.items.map((i) => (i.kind === 'text' ? { ...i, text: change(i.text) } : i)) };
}

/** Start editing: the standard layout becomes the project's own, once. */
export function customiseTitleBlock(standard: TitleBlockTemplate): void {
  if (!current()) write({ items: standard.items.map((i) => ({ ...i })) });
}

/** Back to the standard layout. */
export function resetTitleBlockTemplate(): void {
  write(undefined);
}

export function removeTemplateItem(id: string): void {
  const t = current();
  if (t) write({ items: t.items.filter((i) => i.id !== id) });
}

/** Add an item in a visible place of the block, its fields at once editable. Returns its id, or null at the limit. */
export function addTemplateItem(kind: TemplateItem['kind']): string | null {
  const t = current();
  if (!t || t.items.length >= MAX_ITEMS || !ITEM_KINDS.includes(kind)) return null;
  const id = freshProjectId('tbi');
  const item: TemplateItem = kind === 'line' ? { id, kind, x1: 5, y1: 5, x2: 45, y2: 5, weight: 0.18 }
    : kind === 'rect' ? { id, kind, x: 5, y: 5, w: 40, h: 10, weight: 0.18 }
    : kind === 'text' ? { id, kind, x: 5, y: 10, size: 3, text: 'Text' }
    : { id, kind, x: 5, y: 5, w: 40, h: 11 };
  write({ items: [...t.items, item] });
  return id;
}

/** Change one field of an item. False when the value is refused (the item is left as it was). */
export function setTemplateField(id: string, field: string, value: string | number | boolean): boolean {
  const t = current();
  const item = t?.items.find((i) => i.id === id);
  if (!t || !item) return false;
  const numeric = NUMBERS[item.kind][field];
  let next: TemplateItem;
  if (numeric !== undefined) {
    const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    if (typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(n) || (!numeric && n <= 0) || Math.abs(n) > 10_000) return false;
    next = { ...item, [field]: n } as TemplateItem;
  } else if (item.kind === 'text' && field === 'text' && typeof value === 'string') {
    next = { ...item, text: value.slice(0, MAX_TEXT) };
  } else if (item.kind === 'text' && (field === 'bold' || field === 'muted') && typeof value === 'boolean') {
    next = { ...item, [field]: value };
  } else {
    return false;
  }
  write({ items: t.items.map((i) => (i.id === id ? next : i)) });
  return true;
}

/** Stop shrinking a text to fit. */
export function clearTemplateFit(id: string): void {
  const t = current();
  if (!t) return;
  write({ items: t.items.map((i) => {
    if (i.id !== id || i.kind !== 'text') return i;
    const { fit: _dropped, ...rest } = i;
    return rest;
  }) });
}
