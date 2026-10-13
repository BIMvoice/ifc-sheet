/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Issue the whole set from the sheet panel: a name, whether the drawing list
 * is the first page, and the format. The work is `issue/run.ts`.
 */

import { useState } from 'react';
import { FileStack } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useIssue } from './useIssue';

export function IssuePanel() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [listFirst, setListFirst] = useState(true);
  const { busy, lines, issue } = useIssue();
  return (
    <>
      <h3 className="pt-2 font-bold uppercase tracking-wider">{t('issue.section')}</h3>
      <input aria-label={t('issue.name')} placeholder={t('issue.name')} className="h-6 w-full rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />{t('issue.listFirst')}</label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => void issue('pdf', { name, listFirst })}><FileStack className="size-3.5 mr-1" />{t('issue.pdf')}</Button>
        <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => void issue('svg', { name, listFirst })}>{t('issue.svgZip')}</Button>
        <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => void issue('dxf', { name, listFirst })}>{t('issue.dxfZip')}</Button>
      </div>
      {lines.map((l, i) => <p key={i} className="text-zinc-500">{l}</p>)}
    </>
  );
}
