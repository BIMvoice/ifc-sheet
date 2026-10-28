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

import { BUILTIN_PARAMS, checkParamName, PARAM_NAME, paramLookup, resolveParamText, SOFT_BUILTINS, TOKEN, type BuiltinParam, type ParamNameProblem, type TitleBlockParam } from '@bimvoice/ifcsheet';

/** The built-ins, the token pattern, the text and sheet lookups are the engine's (`packages/ifcsheet/src/title-block-params.ts`): the PDF resolves a layout the same way. */
export { BUILTIN_PARAMS, paramLookup, resolveParamText, SOFT_BUILTINS, type BuiltinParam, type TitleBlockParam };

/** Every name the program fills, for listing to the user: the fixed ones, then those a project's own parameter of the name replaces. */
export const FILLED_PARAMS: readonly string[] = [...BUILTIN_PARAMS, ...SOFT_BUILTINS];

/** The name rule and its check are the engine's (`title-block-file-read.ts`): the project file's reader drops what the editor would refuse by the same rule. */
export { checkParamName, PARAM_NAME, type ParamNameProblem };

/** `text` with `{from}` written `{to}`. */
export function renameParamIn(text: string, from: string, to: string): string {
  return text.replace(TOKEN, (whole, name: string) => (name === from ? `{${to}}` : whole));
}
