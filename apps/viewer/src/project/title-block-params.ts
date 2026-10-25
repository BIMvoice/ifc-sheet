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

import { BUILTIN_PARAMS, paramLookup, resolveParamText, SOFT_BUILTINS, TOKEN, type BuiltinParam, type TitleBlockParam } from '@bimvoice/ifcsheet';

/** The built-ins, the token pattern, the text and sheet lookups are the engine's (`packages/ifcsheet/src/title-block-params.ts`): the PDF resolves a layout the same way. */
export { BUILTIN_PARAMS, paramLookup, resolveParamText, SOFT_BUILTINS, type BuiltinParam, type TitleBlockParam };

/** Every name the program fills, for listing to the user: the fixed ones, then those a project's own parameter of the name replaces. */
export const FILLED_PARAMS: readonly string[] = [...BUILTIN_PARAMS, ...SOFT_BUILTINS];

/** A name: a letter, then letters, digits and underscores. */
export const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

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

/** `text` with `{from}` written `{to}`. */
export function renameParamIn(text: string, from: string, to: string): string {
  return text.replace(TOKEN, (whole, name: string) => (name === from ? `{${to}}` : whole));
}
