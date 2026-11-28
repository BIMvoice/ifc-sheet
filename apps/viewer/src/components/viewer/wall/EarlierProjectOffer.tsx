/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project of an earlier version of the model, on offer (#922, `project/earlier-project-store.ts`): its name, when
 * it was saved, and the two answers. Shown on the intro screen and in the project drawer until one is pressed or other
 * models are opened. Its keys are its own (`data-owns-keys`): Enter on a button answers it and does not also hang the set.
 */

import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';
import { formatLocaleDate } from '@/i18n/intlFormat';
import { forgetEarlierProject, useEarlierProjectStore } from '@/project/earlier-project-store';
import { continueEarlierProject, continueNotice } from '@/whatchanged/continue-earlier';

export function EarlierProjectOffer({ onContinued }: { onContinued?: () => void }) {
  const { t, locale } = useTranslation();
  const offer = useEarlierProjectStore((s) => s.offer);
  if (!offer) return null;
  const time = formatLocaleDate(locale, offer.savedAt, { dateStyle: 'medium', timeStyle: 'short' });
  const project = offer.doc.name;
  const onContinue = () => {
    void continueEarlierProject()
      .then((outcome) => {
        if (outcome) toast.success(continueNotice(outcome, project));
        onContinued?.();
      })
      .catch((err: unknown) => {
        console.warn('[project] the earlier project could not be continued', err);
        toast.error(t('earlierProject.failed', { reason: err instanceof Error ? err.message : String(err) }));
      });
  };
  return (
    <section aria-label={t('earlierProject.title')} data-owns-keys className="mb-8 max-w-lg rounded-md border border-sky-300/40 bg-sky-300/10 p-4">
      <p className="m-0 text-sm font-medium text-sky-200">{t('earlierProject.title')}</p>
      <p className="m-0 mt-1 text-sm text-sky-100/90">{t('earlierProject.body', { project, time })}</p>
      <p className="m-0 mt-1 text-xs text-sky-100/70">{t('earlierProject.detail')}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-md bg-sky-500 px-4 py-1.5 text-sm text-slate-900 hover:bg-sky-400" onClick={onContinue}>{t('earlierProject.continue')}</button>
        <button type="button" className="rounded-md border border-sky-300/40 px-4 py-1.5 text-sm text-sky-100 hover:border-sky-300/80" onClick={forgetEarlierProject}>{t('earlierProject.startNew')}</button>
      </div>
    </section>
  );
}
