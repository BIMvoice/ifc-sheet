/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The how-to pages of the "?" menu (#455), read in the app: the list, and one page's numbered steps. */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/i18n';
import { HOWTO_PAGES, howToStepKeys, howToTitleKey, type HowToId } from './howto-pages';

const pill = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70';

interface HowToDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: HowToId | null;
  onPage: (page: HowToId | null) => void;
}

export function HowToDialog({ open, onOpenChange, page, onPage }: HowToDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-sky-300/20 bg-[#08214a] text-sky-50">
        <DialogHeader>
          <DialogTitle>{page ? t(howToTitleKey(page)) : t('onboarding.howto.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('onboarding.howto.description')}</DialogDescription>
        </DialogHeader>
        {page ? (
          <div className="space-y-4">
            <ol data-howto-steps className="m-0 space-y-2 pl-5 text-sm leading-relaxed text-sky-100">
              {howToStepKeys(page).map((key) => <li key={key}>{t(key)}</li>)}
            </ol>
            <button type="button" className={pill} onClick={() => onPage(null)}>{t('onboarding.howto.back')}</button>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col items-start gap-2 p-0">
            {HOWTO_PAGES.map(({ id }) => (
              <li key={id}><button type="button" className={pill} onClick={() => onPage(id)}>{t(howToTitleKey(id))}</button></li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
