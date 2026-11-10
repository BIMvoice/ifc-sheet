/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Opening and symbol" (#656): the door and window configurator for the one element selected in the drawing, as a card of the Wall. The
 * content is `JoinerySymbolCard` (the symbol choice) with `TypeOpeningForm` (opening type, leaves, fanlight, plan symbol), the same
 * component the properties panel shows, which IfcSheet's face covers. The card sits on a light panel because the form is built from the
 * viewer's own light controls. Nothing here changes the model: the choices go to the project's overrides.
 */

import { useTranslation } from '@/i18n';
import { JoinerySymbolCard } from '../JoinerySymbolCard';
import { WALL_CARD, WALL_CARD_TITLE, WALL_EYEBROW, WALL_PILL } from '../wall/wall-type';

export function ElementOpeningCard({ modelId, expressId, onClose }: { modelId: string; expressId: number; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <aside
      data-opening-card aria-label={t('joinery.reach.title')}
      className={`${WALL_CARD} absolute right-3 top-14 z-20 max-h-[calc(100%-4.5rem)] cursor-default`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className={WALL_EYEBROW}>{t('joinery.reach.eyebrow')}</p>
      <h2 className={WALL_CARD_TITLE}>{t('joinery.reach.title')}</h2>
      <div className="rounded-md bg-white p-2 text-zinc-900">
        <JoinerySymbolCard modelId={modelId} expressId={expressId} />
      </div>
      <button type="button" className={`${WALL_PILL} mt-3`} onClick={onClose}>{t('joinery.reach.close')}</button>
    </aside>
  );
}
