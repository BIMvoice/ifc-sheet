/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The session on offer (`project/recovery-store.ts`): when it was written, for which model, and
 * the two answers. Shown on the intro screen and in the project drawer for as long as it is on
 * offer, which is until one of the two is pressed. Its keys are its own (`data-owns-keys`): Enter
 * on a button answers it and does not also hang the set.
 */

import { useTranslation } from '@/i18n';
import { formatLocaleDate } from '@/i18n/intlFormat';
import { discardRecovery, restoreRecovery, useRecoveryStore } from '@/project/recovery-store';

export function RecoveryOffer({ onRestored }: { onRestored?: () => void }) {
  const { t, locale } = useTranslation();
  const offer = useRecoveryStore((s) => s.offer);
  if (!offer) return null;
  const time = formatLocaleDate(locale, offer.savedAt, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section aria-label={t('wall.recovery.title')} data-owns-keys className="mb-8 max-w-lg rounded-md border border-amber-300/40 bg-amber-300/10 p-4">
      <p className="m-0 text-sm font-medium text-amber-200">{t('wall.recovery.title')}</p>
      <p className="m-0 mt-1 text-sm text-sky-100/90">{t('wall.recovery.body', { model: offer.modelName, time })}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-md bg-amber-500 px-4 py-1.5 text-sm text-slate-900 hover:bg-amber-400" onClick={() => { restoreRecovery(); onRestored?.(); }}>{t('wall.recovery.restore')}</button>
        <button type="button" className="rounded-md border border-sky-300/40 px-4 py-1.5 text-sm text-sky-100 hover:border-sky-300/80" onClick={() => discardRecovery()}>{t('wall.recovery.discard')}</button>
      </div>
    </section>
  );
}
