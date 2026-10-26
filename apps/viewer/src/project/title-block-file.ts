/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading the title block's parameters from a project file (#143); the layout's reader is the engine's
 * (`title-block-template-read.ts`). Lenient where a default is obvious: a malformed parameter or sheet value is
 * dropped, never fatal, and a duplicate or built-in name is dropped as the editor would have refused it.
 */

import { checkParamName, PARAM_NAME, type TitleBlockParam } from './title-block-params';
import { readTitleBlockTemplate } from '@bimvoice/ifcsheet';

export { readTitleBlockTemplate };

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
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

