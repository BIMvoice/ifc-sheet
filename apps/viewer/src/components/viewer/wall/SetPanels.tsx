/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two panels from the top bar, in the drawer's style: what is missing from the
 * set (click a finding to go there, the fix button runs the command that
 * fixes it) and issuing the set (PDF, or zipped SVG or DXF).
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { describeFinding, groupBySheet } from '@/check/say';
import { useProjectStore } from '@/project/project-store';
import { useFindings } from '../sheets/useFindings';
import { useIssue } from '../sheets/useIssue';
import { fixFinding, goToFinding } from './finding-actions';
import { setPanel } from './wall-nav';

const frame = 'absolute inset-y-0 right-0 z-20 flex w-96 flex-col border-l border-sky-300/20 bg-[#08214a] text-sky-50 shadow-2xl';
const action = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70 disabled:opacity-40';

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
  const sheets = useProjectStore((s) => s.sheets);
  const { findings, busy, refresh, fix } = useFindings();
  // The set is read when the panel opens, not on every change.
  useEffect(refresh, []);
  return (
    <aside aria-label={t('check.section')} className={frame}>
      <Header title={t('check.section')} />
      <div className="px-4 pb-3"><button type="button" className={action} disabled={busy} onClick={refresh}>{t('check.refresh')}</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 text-sm">
        {findings === null ? null : findings.length === 0 ? <p className="m-0 text-sky-200/80">{t('check.none')}</p> : (
          <>
            <p className="mb-3 mt-0 text-sky-200/80">{t('check.count', { count: findings.length })}</p>
            {groupBySheet(findings, sheets).map((g) => (
              <div key={g.sheetId ?? 'none'} className="mb-4">
                <p className="m-0 mb-1 font-semibold text-white">{g.title}</p>
                <ul className="m-0 list-none p-0">
                  {g.findings.map((f, i) => (
                    <li key={`${f.kind}-${f.viewId ?? ''}-${f.draftId ?? ''}-${i}`} className="flex items-start justify-between gap-2 py-1">
                      <button type="button" className="text-left text-sky-100 underline-offset-2 hover:underline" onClick={() => { if (goToFinding(f)) setPanel(null); }}>{describeFinding(f)}</button>
                      {f.fix ? <button type="button" className={`${action} shrink-0 px-2 py-0 text-xs`} disabled={busy} onClick={() => { setPanel(null); void fix(f, fixFinding); }}>{t('check.fix')} {f.fix}</button> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

export function IssuePanel() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [listFirst, setListFirst] = useState(true);
  const { busy, lines, issue } = useIssue();
  const options = { name, listFirst };
  return (
    <aside aria-label={t('issue.section')} className={frame}>
      <Header title={t('issue.section')} />
      <div className="flex flex-col gap-3 px-4 pb-6 text-sm">
        <input aria-label={t('issue.name')} placeholder={t('issue.name')} value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-sky-300/30 bg-transparent px-3 py-1.5 text-sky-50 placeholder:text-sky-300/50" />
        <label className="flex items-center gap-2 text-sky-100"><input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />{t('issue.listFirst')}</label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={action} disabled={busy} onClick={() => void issue('pdf', options)}>{t('issue.pdf')}</button>
          <button type="button" className={action} disabled={busy} onClick={() => void issue('svg', options)}>{t('issue.svgZip')}</button>
          <button type="button" className={action} disabled={busy} onClick={() => void issue('dxf', options)}>{t('issue.dxfZip')}</button>
        </div>
        {lines.map((l, i) => <p key={i} className="m-0 text-sky-200/80">{l}</p>)}
      </div>
    </aside>
  );
}
