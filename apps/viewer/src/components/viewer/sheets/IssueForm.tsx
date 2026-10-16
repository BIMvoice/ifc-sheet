/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Issue the whole set: a name, whether the drawing list is the first page, and
 * the format. The work is `issue/run.ts`. The one form for every surface that
 * shows it; a surface supplies its look.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { SetSkin } from './set-skin';
import { useIssue } from './useIssue';

export function IssueForm({ skin }: { skin: SetSkin }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [listFirst, setListFirst] = useState(true);
  const { busy, lines, issue } = useIssue();
  const options = { name, listFirst };
  return (
    <div className="flex flex-col gap-3">
      <input aria-label={t('issue.name')} placeholder={t('issue.name')} className={skin.input} value={name} onChange={(e) => setName(e.target.value)} />
      <label className={skin.check}><input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />{t('issue.listFirst')}</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('pdf', options)}>{t('issue.pdf')}</button>
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('svg', options)}>{t('issue.svgZip')}</button>
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('dxf', options)}>{t('issue.dxfZip')}</button>
      </div>
      {lines.map((l, i) => <p key={i} className={skin.note}>{l}</p>)}
    </div>
  );
}
