/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two panels from the top bar, in the drawer's style: what is missing from the
 * set (click a finding to go there, the fix button runs the command that
 * fixes it) and issuing the set (PDF, or zipped SVG or DXF).
 */

import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { FindingList } from '../sheets/FindingList';
import { IssueForm } from '../sheets/IssueForm';
import { WALL_SKIN } from '../sheets/set-skin';
import { wallNav } from './finding-actions';
import { setPanel } from './wall-nav';

const frame = 'absolute inset-y-0 right-0 z-20 flex w-96 flex-col border-l border-sky-300/20 bg-[#08214a] text-sky-50 shadow-2xl';

function Header({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <header className="flex items-center gap-2 px-4 pb-2 pt-4">
      <p className="m-0 min-w-0 flex-1 truncate text-lg text-white">{title}</p>
      <button type="button" aria-label={t('wall.add.close')} onClick={() => setPanel(null)} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-4" /></button>
    </header>
  );
}

export function MissingPanel() {
  const { t } = useTranslation();
  return (
    <aside aria-label={t('check.section')} className={frame}>
      <Header title={t('check.section')} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 text-sm">
        {/* The set is read when the panel opens, not on every change. */}
        <FindingList nav={wallNav} skin={WALL_SKIN} readOnMount onLeave={() => setPanel(null)} />
      </div>
    </aside>
  );
}

export function IssuePanel() {
  const { t } = useTranslation();
  return (
    <aside aria-label={t('issue.section')} className={frame}>
      <Header title={t('issue.section')} />
      <div className="px-4 pb-6 text-sm">
        <IssueForm skin={WALL_SKIN} />
      </div>
    </aside>
  );
}
