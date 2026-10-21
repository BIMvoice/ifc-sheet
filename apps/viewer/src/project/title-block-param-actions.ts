/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writes to the title block's parameter list (#143). A rename carries the
 * sheets' own values and the `{Name}` in the layout and in sheet text along
 * (the sheet text rewrite is a step of the drafts' undo history);
 * a delete drops the sheets' values. Each returns what refused it, or null.
 */

import { commitDrafts } from '@/drafting/draft-store';
import { useProjectStore } from './project-store';
import { checkParamName, renameParamIn, type ParamNameProblem, type TitleBlockParam } from './title-block-params';
import { renameInTemplate } from './title-block-template-actions';
import { renameInParametricDrafts } from './parametric-text';
import type { ProjectSheet } from './types';

/** `change` applied to each sheet's own values (or to one sheet's); a sheet left with none carries none. */
function patchSheetsTitleParams(sheets: readonly ProjectSheet[], change: (own: Record<string, string>) => Record<string, string>, only?: string): ProjectSheet[] {
  return sheets.map((sheet) => {
    if (!sheet.titleBlockParams || (only !== undefined && sheet.id !== only)) return sheet;
    const own = change(sheet.titleBlockParams);
    const { titleBlockParams: _dropped, ...rest } = sheet;
    return Object.keys(own).length > 0 ? { ...rest, titleBlockParams: own } : rest;
  });
}

const current = (): readonly TitleBlockParam[] => useProjectStore.getState().titleBlockParams ?? [];

export function addTitleBlockParam(name: string, value = ''): ParamNameProblem | null {
  const problem = checkParamName(name, current());
  if (problem) return problem;
  useProjectStore.setState({ titleBlockParams: [...current(), { name: name.trim(), value }], dirty: true });
  return null;
}

export function setTitleBlockParamValue(name: string, value: string): void {
  useProjectStore.setState({ titleBlockParams: current().map((p) => (p.name === name ? { ...p, value } : p)), dirty: true });
}

export function renameTitleBlockParam(from: string, to: string): ParamNameProblem | null {
  const next = to.trim();
  if (next === from) return null;
  const problem = checkParamName(next, current(), from);
  if (problem) return problem;
  const s = useProjectStore.getState();
  useProjectStore.setState({
    titleBlockParams: current().map((p) => (p.name === from ? { ...p, name: next } : p)),
    sheets: patchSheetsTitleParams(s.sheets, (own) => Object.fromEntries(Object.entries(own).map(([k, v]) => [k === from ? next : k, v]))),
    titleBlockTemplate: s.titleBlockTemplate ? renameInTemplate(s.titleBlockTemplate, (text) => renameParamIn(text, from, next)) : s.titleBlockTemplate,
    dirty: true,
  });
  // The texts are the drafts, and the drafts have an undo history: the rewrite is a step of it (a plain `setState` would be silently undone with an older step, which restores the drafts as they were).
  // `renameInParametricDrafts` always returns a new array, so a rename that touched no text must not make an empty step.
  const rewritten = renameInParametricDrafts(s.drafts, (text) => renameParamIn(text, from, next));
  if (rewritten.some((d, i) => d !== s.drafts[i])) commitDrafts(rewritten);
  return null;
}

export function deleteTitleBlockParam(name: string): void {
  const s = useProjectStore.getState();
  useProjectStore.setState({
    titleBlockParams: current().filter((p) => p.name !== name),
    sheets: patchSheetsTitleParams(s.sheets, (own) => Object.fromEntries(Object.entries(own).filter(([k]) => k !== name))),
    dirty: true,
  });
}

/** This sheet's own value for a parameter. */
export function setSheetParam(sheetId: string, name: string, value: string): void {
  const s = useProjectStore.getState();
  useProjectStore.setState({ sheets: s.sheets.map((x) => (x.id === sheetId ? { ...x, titleBlockParams: { ...x.titleBlockParams, [name]: value } } : x)), dirty: true });
}

/** Back to the project's value on this sheet. */
export function clearSheetParam(sheetId: string, name: string): void {
  const s = useProjectStore.getState();
  useProjectStore.setState({
    sheets: patchSheetsTitleParams(s.sheets, (own) => Object.fromEntries(Object.entries(own).filter(([k]) => k !== name)), sheetId),
    dirty: true,
  });
}
