/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A value typed over a cell of a list schedule (#446) whose element is no longer in the model. One finding per element and schedule,
 * named by what the element was called when the value was typed (`about`) and its GlobalId, on the sheet that shows the table. The values
 * are kept in the project in case a newer model brings the element back; the finding's remedy drops them. Same shape as the orphaned tags
 * (`danglingAnnotations`, #298).
 */

import { orphanedJoineryOverrides, orphanedOverrides } from '@bimvoice/ifcsheet';
import type { CheckInput, Finding } from './types';

export function orphanedCellOverrides(input: CheckInput): Finding[] {
  return (input.schedules ?? []).flatMap((schedule): Finding[] => {
    const sheet = input.sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === schedule.id));
    return orphanedOverrides(schedule.list?.overrides, input.elementExists).map((o): Finding => ({
      kind: 'orphanedOverride', key: 'check.orphanedOverride', sheetId: sheet?.id, guids: [o.guid], scheduleId: schedule.id, remedies: ['delete'],
      params: { count: o.count, schedule: schedule.name, element: o.about ? `"${o.about}" · ${o.guid}` : o.guid, sheet: sheet?.number ?? '' },
    }));
  });
}

/**
 * A value typed over a cell of a door and window schedule (#446) whose type is no longer in the model (or the catalogue). One finding per type,
 * named by what the type was called when the value was typed, on the first sheet that shows a joinery schedule. The values are kept in case a newer
 * model brings the type back; the finding's remedy drops them.
 */
export function orphanedJoineryCells(input: CheckInput): Finding[] {
  if (!input.joinery) return [];
  const holder = (input.schedules ?? []).find((s) => (s.kind === 'door' || s.kind === 'window' || s.kind === 'all') && input.sheets.some((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === s.id)));
  const sheet = holder ? input.sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === holder.id)) : undefined;
  return orphanedJoineryOverrides(input.joinery.overrides, input.joinery.entries).map((o): Finding => ({
    kind: 'orphanedJoineryOverride', key: 'check.orphanedJoineryOverride', sheetId: sheet?.id, typeKeys: [o.type], remedies: ['delete'],
    params: { count: o.count, type: o.about ? `"${o.about}"` : o.type, sheet: sheet?.number ?? '' },
  }));
}
