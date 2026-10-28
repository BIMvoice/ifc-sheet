/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "?" menu of IfcSheet's top bar (#455): the keyboard shortcuts, short
 * how-to pages read in the app, the report-or-suggest form (#148), the project
 * on GitHub (opened in a new tab), the tour, and the hints setting.
 */

import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/i18n';
import { openSettings } from '@/lib/settings/open-settings';
import { EVENT_SHOW_SHORTCUTS } from '@/lib/tours/events';
import { FeedbackDialog } from '@/components/viewer/feedback/FeedbackDialog';
import { FEEDBACK_REPO } from '@/feedback/feedback-url';
import { HOWTO_PAGES, howToTitleKey, type HowToId } from './howto-pages';
import { HowToDialog } from './HowToDialog';

const ITEM = 'cursor-pointer focus:bg-sky-400/20 focus:text-white';

/** IfcSheet's repository: the one the report-or-suggest form files issues in. */
export const REPO_URL = `https://github.com/${FEEDBACK_REPO}`;

export function HelpMenu({ className, onTour }: { className: string; onTour: () => void }) {
  const { t } = useTranslation();
  const [howTo, setHowTo] = useState<{ open: boolean; page: HowToId | null }>({ open: false, page: null });
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('onboarding.menu.label')} title={t('onboarding.menu.label')} className={className}>?</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64 border-sky-300/20 bg-[#08214a] text-sky-50">
          <DropdownMenuItem className={ITEM} onSelect={() => window.dispatchEvent(new CustomEvent(EVENT_SHOW_SHORTCUTS, { detail: { tab: 'shortcuts' } }))}>{t('onboarding.menu.shortcuts')}</DropdownMenuItem>
          <DropdownMenuSeparator className="bg-sky-300/20" />
          <DropdownMenuLabel className="text-xs font-normal text-sky-200">{t('onboarding.menu.howTo')}</DropdownMenuLabel>
          {HOWTO_PAGES.map(({ id }) => (
            <DropdownMenuItem key={id} className={ITEM} onSelect={() => setHowTo({ open: true, page: id })}>{t(howToTitleKey(id))}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-sky-300/20" />
          <DropdownMenuItem className={ITEM} onSelect={() => setFeedback(true)}>{t('onboarding.menu.report')}</DropdownMenuItem>
          <DropdownMenuItem className={ITEM} asChild>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{t('onboarding.menu.github')}</a>
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={onTour}>{t('onboarding.menu.tour')}</DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={() => openSettings('general')}>{t('onboarding.menu.hints')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <HowToDialog open={howTo.open} onOpenChange={(open) => setHowTo((h) => ({ ...h, open }))} page={howTo.page} onPage={(page) => setHowTo({ open: true, page })} />
      <FeedbackDialog open={feedback} onOpenChange={setFeedback} />
    </>
  );
}
