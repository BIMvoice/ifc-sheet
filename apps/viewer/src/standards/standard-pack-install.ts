/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Installing a standards pack in the project (#365), and taking it back.
 *
 * "Install standard" changes every part the pack carries in ONE undo step (`runAsOneUndoStep`): the graphic standard
 * with its styles, the title block layout, the units and number format, the numbering scheme. The values the project
 * held before are kept with the project (`installedStandard.previous`) the first time, so a later install of the same
 * or another pack never overwrites them with a pack's own values, and "Reset" (also one undo step) puts them back.
 * Installing the same pack again changes nothing.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { StandardPreviousValues } from '@/project/fields/installed-standard';
import { setGraphicStandard } from '@/project/graphic-standard-actions';
import { setSchemeForNewSheets } from '@/project/sheet-renumber';
import { applyRomanianTitleBlock, resetTitleBlockTemplate } from '@/project/title-block-template-actions';
import { setUnitsAndNumbers, useProjectStore } from '@/project/project-store';
import type { StandardPack } from './standard-pack';

const state = () => useProjectStore.getState();

/** What the project holds now for each part `pack` sets and `already` has not kept. */
function capture(pack: StandardPack, already: StandardPreviousValues): StandardPreviousValues {
  const s = state();
  const out: StandardPreviousValues = { ...already };
  if (pack.graphicStandard !== undefined && !('graphicStandard' in out)) out.graphicStandard = s.graphicStandard ?? null;
  if (pack.titleBlockTemplate !== undefined && !('titleBlockTemplate' in out)) out.titleBlockTemplate = s.titleBlockTemplate ?? null;
  if (pack.unitsAndNumbers !== undefined && !('unitsAndNumbers' in out)) out.unitsAndNumbers = s.unitsAndNumbers ?? null;
  if (pack.sheetNumbering !== undefined && !('sheetNumbering' in out)) out.sheetNumbering = s.sheetNumbering ?? null;
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Whether the project is, right now, as `pack` leaves it: it is the installed version and every part it carries holds the pack's value. */
export function isApplied(pack: StandardPack, s: ReturnType<typeof state> = state()): boolean {
  if (s.installedStandard?.id !== pack.id || s.installedStandard.version !== pack.version) return false;
  if (pack.graphicStandard !== undefined && s.graphicStandard !== pack.graphicStandard) return false;
  if (pack.titleBlockTemplate !== undefined && !same(s.titleBlockTemplate, pack.titleBlockTemplate)) return false;
  if (pack.unitsAndNumbers !== undefined && !Object.entries(pack.unitsAndNumbers).every(([k, v]) => same(s.unitsAndNumbers?.[k as keyof typeof s.unitsAndNumbers], v))) return false;
  if (pack.sheetNumbering !== undefined && !same(s.sheetNumbering, pack.sheetNumbering)) return false;
  return true;
}

/** Install `pack`: one undo step. Installing a pack the project is already as (`isApplied`) does nothing and leaves no step. */
export function installStandard(pack: StandardPack): void {
  if (isApplied(pack)) return;
  runAsOneUndoStep(() => {
    const previous = capture(pack, state().installedStandard?.previous ?? {});
    if (pack.graphicStandard !== undefined) setGraphicStandard(pack.graphicStandard);
    if (pack.titleBlockTemplate !== undefined) applyRomanianTitleBlock(pack.titleBlockTemplate);
    if (pack.unitsAndNumbers !== undefined) setUnitsAndNumbers(pack.unitsAndNumbers);
    if (pack.sheetNumbering !== undefined) setSchemeForNewSheets(pack.sheetNumbering);
    useProjectStore.setState({ installedStandard: { id: pack.id, version: pack.version, previous }, dirty: true });
  });
}

/** Put back what the project held before a pack was installed, part by part: one undo step. False when no pack is installed. */
export function resetStandard(): boolean {
  const installed = state().installedStandard;
  if (!installed) return false;
  const { previous } = installed;
  runAsOneUndoStep(() => {
    if ('graphicStandard' in previous) setGraphicStandard(previous.graphicStandard ?? 'default');
    if ('titleBlockTemplate' in previous) {
      if (previous.titleBlockTemplate) applyRomanianTitleBlock(previous.titleBlockTemplate); else resetTitleBlockTemplate();
    }
    if ('unitsAndNumbers' in previous) useProjectStore.setState({ unitsAndNumbers: previous.unitsAndNumbers ?? undefined, dirty: true });
    if ('sheetNumbering' in previous) useProjectStore.setState({ sheetNumbering: previous.sheetNumbering ?? undefined, dirty: true });
    useProjectStore.setState({ installedStandard: undefined, dirty: true });
  });
  return true;
}
