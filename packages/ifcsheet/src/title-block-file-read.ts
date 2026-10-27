/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's typed values and parameters read from a project file (#143). The app's project reader and the
 * command line's read them through these functions, so a value typed in the app prints in `ifcsheet build --project`
 * as it does on screen. Lenient where a default is obvious: a malformed value or parameter is dropped, never fatal,
 * and a duplicate or built-in name is dropped as the editor would have refused it. The layout's reader is
 * `title-block-template-read.ts`, the model-source mapping's `readTitleSources`.
 */

import { BUILTIN_PARAMS, type TitleBlockParam } from './title-block-params.js';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

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

/** A title block's fields (a sheet's or the project's): its string values; `undefined` when absent. */
export function readTitleBlock(v: unknown): Record<string, string> | undefined {
  return isObject(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isString(e[1]))) : undefined;
}

/** The project's own parameters, in order. */
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
