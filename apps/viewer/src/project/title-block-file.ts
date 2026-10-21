/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the title block's parameters and layout from a project file (#143).
 * Lenient where a default is obvious: a malformed parameter, sheet value or
 * layout item is dropped, never fatal, and a duplicate or built-in name is
 * dropped as the editor would have refused it.
 */

import { MAX_TEXT } from './title-block-template-actions';
import { checkParamName, PARAM_NAME, type TitleBlockParam } from './title-block-params';
import { ITEM_KINDS, type TemplateItem, type TitleBlockTemplate } from './title-block-template';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string';

export function readTitleBlockParams(raw: unknown): TitleBlockParam[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TitleBlockParam[] = [];
  for (const p of raw) {
    if (isObject(p) && isString(p.name) && isString(p.value) && checkParamName(p.name, out) === null) out.push({ name: p.name.trim(), value: p.value });
  }
  return out;
}

/** A sheet's own parameter values. */
export function readSheetParams(raw: unknown): Record<string, string> | undefined {
  if (!isObject(raw)) return undefined;
  const out = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => PARAM_NAME.test(e[0]) && isString(e[1])));
  return Object.keys(out).length > 0 ? out : undefined;
}

function readItem(v: unknown): TemplateItem | null {
  if (!isObject(v) || !isString(v.id) || !v.id || !ITEM_KINDS.includes(v.kind as TemplateItem['kind'])) return null;
  const num = (key: string): number | null => (isNumber(v[key]) && Math.abs(v[key]) <= 10_000 ? v[key] : null);
  const pos = (key: string): number | null => {
    const n = num(key);
    return n !== null && n > 0 ? n : null;
  };
  const id = v.id;
  switch (v.kind) {
    case 'line': {
      const [x1, y1, x2, y2, weight] = [num('x1'), num('y1'), num('x2'), num('y2'), pos('weight')];
      return x1 !== null && y1 !== null && x2 !== null && y2 !== null && weight !== null ? { id, kind: 'line', x1, y1, x2, y2, weight } : null;
    }
    case 'rect': {
      const [x, y, w, h, weight] = [num('x'), num('y'), pos('w'), pos('h'), pos('weight')];
      return x !== null && y !== null && w !== null && h !== null && weight !== null ? { id, kind: 'rect', x, y, w, h, weight } : null;
    }
    case 'logo': {
      const [x, y, w, h] = [num('x'), num('y'), pos('w'), pos('h')];
      return x !== null && y !== null && w !== null && h !== null ? { id, kind: 'logo', x, y, w, h } : null;
    }
    default: {
      const [x, y, size] = [num('x'), num('y'), pos('size')];
      if (x === null || y === null || size === null || !isString(v.text)) return null;
      const fit = pos('fit');
      return { id, kind: 'text', x, y, size, text: v.text.slice(0, MAX_TEXT), ...(v.bold === true ? { bold: true } : {}), ...(v.muted === true ? { muted: true } : {}), ...(fit !== null ? { fit } : {}) };
    }
  }
}

export function readTitleBlockTemplate(raw: unknown): TitleBlockTemplate | undefined {
  if (!isObject(raw) || !Array.isArray(raw.items)) return undefined;
  const seen = new Set<string>();
  const items: TemplateItem[] = [];
  for (const v of raw.items.slice(0, 500)) {
    const item = readItem(v);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return { items };
}
