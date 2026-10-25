/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What `{Name}` means in a title block (#143): the built-in names, the
 * project's own parameters with a sheet's values on top, and the title block
 * fields that fill the built-ins. The app's sheet and this package's PDF both
 * read through these, so a layout cannot print one thing on screen and
 * another on paper.
 */

import type { ProjectSheet } from './document.js';

export interface TitleBlockParam {
  name: string;
  value: string;
}

/** `{Name}`: a letter, then letters, digits and underscores. */
export const TOKEN = /\{([A-Za-z][A-Za-z0-9_]{0,39})\}/g;

/**
 * The names the program fills, which a user's parameter cannot take: the
 * sheet's own (number, name, scale, page, revision) and the original title
 * block fields.
 */
export const BUILTIN_PARAMS = ['SheetNumber', 'SheetName', 'Scale', 'Date', 'Page', 'Project', 'Address', 'Client', 'Organisation', 'DrawnBy', 'CheckedBy', 'Revision'] as const;

/**
 * The Romanian title block's fields. A project saved before them may already
 * have a parameter of one of these names, so these yield to it: a user's
 * parameter of the name wins, and the name stays free to take. (`{Phase}`
 * itself is not one of them: it stays a user's name, as the parameter text
 * tool's own example uses it.)
 */
export const SOFT_BUILTINS = ['ProjectPhase', 'ProjectNumber', 'ProjectManager', 'DesignedBy'] as const;
export type BuiltinParam = (typeof BUILTIN_PARAMS)[number] | (typeof SOFT_BUILTINS)[number];

/**
 * The title block field (`project/title-block.ts` in the app) each built-in
 * is filled from. The Romanian layout's roles: `organisation` is the
 * proiectant general, `projectManager` the șef de proiect, `designer`
 * "proiectat", `drawnBy` "desenat", `checkedBy` "verificat".
 */
export const FIELD_PARAMS = {
  project: 'Project', address: 'Address', client: 'Client', organisation: 'Organisation', drawnBy: 'DrawnBy', checkedBy: 'CheckedBy', date: 'Date',
  phase: 'ProjectPhase', projectNumber: 'ProjectNumber', projectManager: 'ProjectManager', designer: 'DesignedBy',
} as const satisfies Record<string, BuiltinParam>;

/** The built-ins a set of title block fields gives (`''` for a field not set). */
export function fieldBuiltins(fields: Readonly<Record<string, string>>): Partial<Record<BuiltinParam, string>> {
  const out: Partial<Record<BuiltinParam, string>> = {};
  for (const [field, param] of Object.entries(FIELD_PARAMS)) out[param] = fields[field] ?? '';
  return out;
}

/** `text` with each `{Name}` replaced by what `lookup` says; a name nothing answers to prints as `{Name?}`. */
export function resolveParamText(text: string, lookup: (name: string) => string | undefined): string {
  return text.replace(TOKEN, (_, name: string) => lookup(name) ?? `{${name}?}`);
}

/**
 * The lookup for one sheet: the built-ins first (a built-in name is never a
 * user's), then the user's parameters, the sheet's own value over the
 * project's when the project has the parameter.
 */
export function paramLookup(sheet: Pick<ProjectSheet, 'titleBlockParams'>, params: readonly TitleBlockParam[] | undefined, builtins: Readonly<Partial<Record<BuiltinParam, string>>>): (name: string) => string | undefined {
  const project = new Map((params ?? []).map((p) => [p.name, p.value]));
  return (name) => {
    if ((BUILTIN_PARAMS as readonly string[]).includes(name)) return builtins[name as BuiltinParam] ?? '';
    if ((SOFT_BUILTINS as readonly string[]).includes(name) && !project.has(name)) return builtins[name as BuiltinParam] ?? '';
    const own = sheet.titleBlockParams?.[name];
    return own !== undefined && project.has(name) ? own : project.get(name);
  };
}
