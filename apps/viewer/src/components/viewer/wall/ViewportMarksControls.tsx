/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The two switches of a viewport's marks: a north arrow (plans only) and a
 * graphic scale bar. What a switch shows when the viewport has not been
 * touched is off (`viewportMarkFlags`); the first click stores the choice on
 * the viewport. A site plan has its own symbols in a free spot, so it is not offered.
 */

import { viewportMarkFlags } from '@bimvoice/ifcsheet/viewport-marks';
import { useTranslation } from '@/i18n';
import { editViewport } from '@/project/sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';

export function ViewportMarksControls({ sheet, slot, view }: { sheet: ProjectSheet; slot: SheetViewport; view: ProjectView }) {
  const { t } = useTranslation();
  const shown = viewportMarkFlags(slot, view);
  // A flag off because the view cannot carry the mark (no scale, not a plan) is not offered.
  const canBar = view.kind !== '3d' && slot.keyPlanOf === undefined && !(view.kind === 'plan' && view.site === true);
  const canArrow = view.kind === 'plan' && slot.keyPlanOf === undefined && !(view.kind === 'plan' && view.site === true);
  if (!canBar && !canArrow) return null;
  return (
    <div className="mt-4 flex flex-col gap-1 text-sm text-white">
      {canArrow ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shown.northArrow} onChange={(e) => editViewport(sheet.id, slot.id, { northArrow: e.target.checked })} />
          {t('wall.vp.northArrow')}
        </label>
      ) : null}
      {canBar ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shown.scaleBar} onChange={(e) => editViewport(sheet.id, slot.id, { scaleBar: e.target.checked })} />
          {t('wall.vp.scaleBar')}
        </label>
      ) : null}
    </div>
  );
}
