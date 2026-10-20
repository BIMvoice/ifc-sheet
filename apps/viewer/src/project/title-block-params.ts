/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's parameters (#143): a user-defined list of name and value,
 * each with a project-wide value and an optional per-sheet value, the same
 * model as the title block's own fields. Text reads one by name, `{Name}`,
 * alone or mixed into other words, in the title block's layout and on a sheet
 * (`ptext` drafts). A name nobody defined resolves to `{Name?}`, never to
 * nothing. The built-in names (the sheet's number, name and scale, the date,
 * the page, and the title block's own fields) are filled by the program and
 * cannot be taken.
 */

import type { ProjectSheet } from './types';

export interface TitleBlockParam {
  name: string;
  value: string;
}

/** A name: a letter, then letters, digits and underscores. */
export const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
/** `{Name}` inside text. */
const TOKEN = /\{([A-Za-z][A-Za-z0-9_]{0,39})\}/g;

/** The built-in parameters, read-only: the sheet's own facts and the title block fields (`title-block.ts`), by the name text uses. */
export const BUILTIN_PARAMS = ['SheetNumber', 'SheetName', 'Scale', 'Date', 'Page', 'Project', 'Address', 'Client', 'Organisation', 'DrawnBy', 'CheckedBy', 'Revision'] as const;
export type BuiltinParam = (typeof BUILTIN_PARAMS)[number];

const BUILTIN_LOWER = new Set(BUILTIN_PARAMS.map((n) => n.toLowerCase()));

export type ParamNameProblem = 'empty' | 'invalid' | 'builtin' | 'duplicate';

/** Why `name` cannot be a parameter's name, or null. `except` is the name being renamed, which may be kept. Names are told apart without regard to case, so `{phase}` never silently means something else than `{Phase}`. */
export function checkParamName(name: string, existing: readonly TitleBlockParam[], except?: string): ParamNameProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (!PARAM_NAME.test(trimmed)) return 'invalid';
  if (BUILTIN_LOWER.has(trimmed.toLowerCase())) return 'builtin';
  const lower = trimmed.toLowerCase();
  if (existing.some((p) => p.name !== except && p.name.toLowerCase() === lower)) return 'duplicate';
  return null;
}

/** `text` with each `{Name}` replaced by what `lookup` says; a name it does not know becomes `{Name?}`. The values are not read again. */
export function resolveParamText(text: string, lookup: (name: string) => string | undefined): string {
  return text.replace(TOKEN, (_, name: string) => lookup(name) ?? `{${name}?}`);
}

/** `text` with `{from}` written `{to}`. */
export function renameParamIn(text: string, from: string, to: string): string {
  return text.replace(TOKEN, (whole, name: string) => (name === from ? `{${to}}` : whole));
}

/**
 * The lookup a sheet's text resolves through: the built-ins first (they own their names), then the sheet's own
 * value, then the project's. A sheet value for a parameter the project no longer has is not read.
 */
export function paramLookup(sheet: Pick<ProjectSheet, 'titleBlockParams'>, params: readonly TitleBlockParam[] | undefined, builtins: Readonly<Partial<Record<BuiltinParam, string>>>): (name: string) => string | undefined {
  const project = new Map((params ?? []).map((p) => [p.name, p.value]));
  return (name) => {
    if ((BUILTIN_PARAMS as readonly string[]).includes(name)) return builtins[name as BuiltinParam] ?? '';
    const own = sheet.titleBlockParams?.[name];
    return own !== undefined && project.has(name) ? own : project.get(name);
  };
}
