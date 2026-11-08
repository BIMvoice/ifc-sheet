/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Polyline tool's Close and Undo last point on its card (#168), for a person who does not type C or U. They send the same
 * keywords the command line takes, so the command has one path. Both wait for a first point: with none placed there is
 * nothing to close or take back.
 */

import { submitCommandLine, useDraftingSession } from '@/drafting/session';
import { useTranslation } from '@/i18n';
import { WALL_PILL } from './wall-type';

export function PolylineToolButtons() {
  const { t } = useTranslation();
  const started = useDraftingSession((s) => s.commandId === 'polyline' && s.prompt?.key === 'drafting.prompt.polylineNext');
  return (
    <fieldset className="m-0 mt-4 flex flex-wrap gap-2 border-0 p-0" aria-label={t('polylineCard.group')}>
      <button type="button" className={WALL_PILL} disabled={!started} onClick={() => submitCommandLine('C', null)}>{t('polylineCard.close')}</button>
      <button type="button" className={WALL_PILL} disabled={!started} onClick={() => submitCommandLine('U', null)}>{t('polylineCard.undo')}</button>
    </fieldset>
  );
}
