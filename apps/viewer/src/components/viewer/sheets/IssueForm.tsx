/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Issue the whole set: a name, whether the drawing list is the first page, and
 * the format. The work is `issue/run.ts`. The one form for every surface that
 * shows it; a surface supplies its look.
 */

import { useState } from 'react';
import { HANDOVER_DEFAULT_PATTERN, HANDOVER_PATTERN_MAX, HANDOVER_TOKENS, handoverFileName } from '@bimvoice/ifcsheet/handover';
import { useTranslation } from '@/i18n';
import { setHandoverPattern, useProjectStore } from '@/project/project-store';
import { AnnotatedIfcButton } from './AnnotatedIfcButton';
import type { SetSkin } from './set-skin';
import { IssueChanges } from './IssueChanges';
import { useIssue } from './useIssue';
import { todayText, validDate } from '@/issue/plan';

/** The project's file name pattern for the handover package, with the name it gives an example sheet. */
function HandoverPattern({ skin, date }: { skin: SetSkin; date: string }) {
  const { t } = useTranslation();
  const stored = useProjectStore((s) => s.handoverPattern);
  const project = useProjectStore((s) => s.name);
  const [draft, setDraft] = useState(stored ?? HANDOVER_DEFAULT_PATTERN);
  const example = handoverFileName(draft.trim() || HANDOVER_DEFAULT_PATTERN, { project, number: 'A-101', sheet: 'Ground floor', revision: 'B', date, issue: 'Issue 1' }, 'dxf');
  return (
    <div className="flex flex-col gap-1">
      <label className={skin.note} htmlFor="handover-pattern">{t('handover.pattern')}</label>
      <div className="flex gap-2">
        <input id="handover-pattern" aria-describedby="handover-pattern-hint" className={`${skin.input} min-w-0 flex-1`} maxLength={HANDOVER_PATTERN_MAX} value={draft}
          onChange={(e) => { setDraft(e.target.value); setHandoverPattern(e.target.value); }} />
        <button type="button" className={skin.button} onClick={() => { setDraft(HANDOVER_DEFAULT_PATTERN); setHandoverPattern(''); }}>{t('handover.pattern.reset')}</button>
      </div>
      <p id="handover-pattern-hint" className={skin.note}>{t('handover.pattern.hint', { tokens: HANDOVER_TOKENS.map((k) => `{${k}}`).join(' ') })}</p>
      <p className={skin.note}>{t('handover.pattern.example', { name: example })}</p>
    </div>
  );
}

export function IssueForm({ skin }: { skin: SetSkin }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayText);
  const [listFirst, setListFirst] = useState(true);
  const [archival, setArchival] = useState(false);
  const { busy, lines, issue } = useIssue();
  const [currentOnly, setCurrentOnly] = useState(false);
  // An empty or half-typed date is today, as the issue itself reads it.
  const issueDate = validDate(date, todayText());
  const options = { name, date: issueDate, listFirst, archival, currentCloudsOnly: currentOnly };
  return (
    <div className="flex flex-col gap-3">
      <input aria-label={t('issue.name')} placeholder={t('issue.name')} className={skin.input} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-col gap-1">
        <label className={skin.note} htmlFor="issue-date">{t('issue.date')}</label>
        <input id="issue-date" type="date" aria-describedby="issue-date-hint" className={skin.input} value={date} onChange={(e) => setDate(e.target.value)} />
        <p id="issue-date-hint" className={skin.note}>{t('issue.date.hint')}</p>
      </div>
      <IssueChanges skin={skin} date={issueDate} />
      <label className={skin.check}><input type="checkbox" checked={listFirst} onChange={(e) => setListFirst(e.target.checked)} />{t('issue.listFirst')}</label>
      <label className={skin.check}><input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} />{t('issue.currentOnly')}</label>
      <label className={skin.check}><input type="checkbox" checked={archival} onChange={(e) => setArchival(e.target.checked)} />{t('issue.archival')}</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('pdf', options)}>{t('issue.pdf')}</button>
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('svg', options)}>{t('issue.svgZip')}</button>
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('dxf', options)}>{t('issue.dxfZip')}</button>
        <button type="button" className={skin.button} disabled={busy} onClick={() => void issue('handover', options)}>{t('handover.action')}</button>
      </div>
      <p className={skin.note}>{t('handover.hint')}</p>
      <HandoverPattern skin={skin} date={issueDate} />
      <AnnotatedIfcButton skin={skin} />
      {lines.map((l, i) => <p key={i} className={skin.note}>{l}</p>)}
    </div>
  );
}
