/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** One first-use hint (#455): a line of text over the sheet, with a button that dismisses it for good. */

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { dismissHint, useHintVisible, type HintId } from './hints';

export function Hint({ id, children }: { id: HintId; children: ReactNode }) {
  const { t } = useTranslation();
  const visible = useHintVisible(id);
  if (!visible) return null;
  return (
    <output
      data-hint={id}
      className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3"
    >
      <p className="pointer-events-auto m-0 flex max-w-xl items-center gap-2 rounded-full border border-sky-300/40 bg-[#0b2348]/95 py-1 pl-4 pr-1 text-xs text-sky-100 shadow-lg">
        <span>{children}</span>
        <button
          type="button"
          aria-label={t('onboarding.hint.dismiss')}
          title={t('onboarding.hint.dismiss')}
          onClick={() => dismissHint(id)}
          className="rounded-full p-1 text-sky-200 hover:bg-sky-300/20 focus-visible:outline focus-visible:outline-1 focus-visible:outline-sky-300"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </p>
    </output>
  );
}
