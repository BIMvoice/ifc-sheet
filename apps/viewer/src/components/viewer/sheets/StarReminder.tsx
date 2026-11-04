/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The one line under an issued set that asks for a star (#655). Inline in the result card, never a modal. */

import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { STAR_URL } from '@/lib/star';
import type { SetSkin } from './set-skin';

export function StarReminder({ skin, onClose }: { skin: SetSkin; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="note" data-testid="star-reminder" className="flex items-start gap-2">
      <p className={`${skin.note} min-w-0 flex-1`}>
        {t('star.reminder')}{' '}
        <a href={STAR_URL} target="_blank" rel="noopener noreferrer" className="underline" onClick={onClose}>{t('star.reminderLink')}</a>
      </p>
      <button type="button" aria-label={t('star.close')} className={skin.button} onClick={onClose}><X className="h-3 w-3" aria-hidden="true" /></button>
    </div>
  );
}
