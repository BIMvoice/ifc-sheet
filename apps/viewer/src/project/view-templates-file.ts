/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the project's view templates (#44) from a project file: a template that is not an object with an id, a name and one of the
 * three kinds is dropped, a graphics field that is malformed is dropped, never fatal (the views that named it then draw with their own
 * graphics). A template carries the parts of the graphics a template can (`TemplateGraphics`): the rest of what `readGraphics` reads is ignored.
 */

import { VIEW_TEMPLATE_KINDS, templateGraphicsOf, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { readGraphics } from './view-graphics-file';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One template, or null when it is not one (no id, no name, not one of the three kinds). */
export function readViewTemplate(v: unknown): ProjectViewTemplate | null {
  if (!isObject(v) || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !v.name.trim()) return null;
  const kind = VIEW_TEMPLATE_KINDS.find((k) => k === v.kind);
  if (!kind) return null;
  return { id: v.id, name: v.name, kind, graphics: isObject(v.graphics) ? templateGraphicsOf(readGraphics(v.graphics)) : {} };
}

export function readViewTemplates(raw: unknown): ProjectViewTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProjectViewTemplate[] = [];
  for (const v of raw) {
    const template = readViewTemplate(v);
    if (!template || seen.has(template.id)) continue;
    seen.add(template.id);
    out.push(template);
  }
  return out;
}
