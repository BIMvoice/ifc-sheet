/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What is missing from the set (`check/`): a plain list grouped by sheet. A
 * line goes to its place when clicked; where one command fixes it, a button
 * runs that command on the view. The list is read when asked and again after a
 * fix, so it shrinks as the set is finished.
 */

import { ListChecks } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { goTo, runFix } from '@/check/go';
import { describeFinding, groupBySheet } from '@/check/say';
import type { Finding } from '@/check/types';
import { useProjectStore } from '@/project/project-store';
import { useFindings } from './useFindings';

export function CheckPanel() {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const { findings, busy, refresh, fix } = useFindings();
  return (
    <>
      <h3 className="pt-2 font-bold uppercase tracking-wider">{t('check.section')}</h3>
      <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={refresh}><ListChecks className="size-3.5 mr-1" />{t('check.refresh')}</Button>
      {findings && (findings.length === 0 ? <p className="text-zinc-500">{t('check.none')}</p> : (
        <>
          <p className="text-zinc-500">{t('check.count', { count: findings.length })}</p>
          {groupBySheet(findings, sheets).map((g) => (
            <div key={g.sheetId ?? 'none'}>
              <p className="font-semibold">{g.title}</p>
              <ul>
                {g.findings.map((f, i) => (
                  <li key={`${f.kind}-${f.viewId ?? ''}-${f.draftId ?? ''}-${i}`} className="flex items-start justify-between gap-2 py-0.5">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => goTo(f)}>{describeFinding(f)}</button>
                    {f.fix && <Button variant="outline" size="sm" className="h-5 shrink-0 px-1" disabled={busy} onClick={() => void fix(f, runFix)}>{t('check.fix')} {f.fix}</Button>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ))}
    </>
  );
}
