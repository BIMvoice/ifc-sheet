/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation } from '@/i18n';
import { setOpeningConvention, useOpeningConvention } from '@/joinery/opening-convention';
import type { OpeningConvention } from '@/joinery/symbols';
import type { DrawerSection } from './types';

/**
 * Which way the opening lines of doors and windows point in elevation (#870): to the handle (the default) or to the hinges. The
 * project's `openingLines`, the same setting the joinery catalogue shows; a standard sets it when chosen and this changes it after.
 */
function OpeningLines() {
  const { t } = useTranslation();
  const convention = useOpeningConvention();
  return (
    <section className="border-t border-sky-300/10 px-4 py-3">
      <label className="block">
        <span className="mb-1.5 block text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('joinery.openingLines')}</span>
        <select data-opening-lines aria-label={t('joinery.openingLines')} title={t(`joinery.openingLines.${convention}.hint`)} className="h-7 w-full rounded-sm border border-sky-300/20 bg-transparent px-1 text-xs text-sky-100"
          value={convention} onChange={(e) => setOpeningConvention(e.target.value as OpeningConvention)}>
          <option value="handle" title={t('joinery.openingLines.handle.hint')}>{t('joinery.openingLines.handle')}</option>
          <option value="hinge" title={t('joinery.openingLines.hinge.hint')}>{t('joinery.openingLines.hinge')}</option>
        </select>
      </label>
    </section>
  );
}

/** The direction of the opening lines (#870), next to the standards that set it. */
export const openingLinesSection: DrawerSection = { id: 'opening-lines', slot: 'body', order: 152, component: OpeningLines };
