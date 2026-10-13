/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What is missing from the set (`check/`): a plain list grouped by sheet. A
 * line goes to its place when clicked; where one command fixes it, a button
 * runs that command on the view. The list is read when asked and again after a
 * fix, so it shrinks as the set is finished. The one list for every surface
 * that shows it; a surface supplies its look and how it opens a place.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { fillTitleBlockEverywhere } from '@/check/fill-actions';
import type { Finding } from '@/check/types';
import type { TranslationKey } from '@/i18n';
import { goToFinding, type FindingNav } from '@/check/go';
import { describeFinding, groupBySheet } from '@/check/say';
import { useProjectStore } from '@/project/project-store';
import type { SetSkin } from './set-skin';
import { useFindings } from './useFindings';

interface Props {
  nav: FindingNav;
  skin: SetSkin;
  /** Read the set when the list appears, not only when asked. */
  readOnMount?: boolean;
  /** The surface moves on to the place (a panel that covers the drawing closes). */
  onLeave?: () => void;
}

/** The one value that fills a title-block field on every sheet that lacks it; new sheets take it too. */
function FillField({ finding, skin, onFilled }: { finding: Finding; skin: SetSkin; onFilled: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const field = t(`sheets.tb.${finding.fill!.field}` as TranslationKey);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="m-0">{describeFinding(finding)}</p>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('check.fillValue', { field })} placeholder={field} className={`min-w-0 flex-1 ${skin.input}`} />
        <button type="button" className={`${skin.button} shrink-0`} disabled={value.trim() === ''} onClick={() => { fillTitleBlockEverywhere(finding.fill!.field, value); onFilled(); }}>{t('check.fillWith', { field, count: finding.fill!.sheetIds.length })}</button>
      </div>
    </div>
  );
}

export function FindingList({ nav, skin, readOnMount = false, onLeave }: Props) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const { findings, busy, refresh, fix } = useFindings();
  useEffect(() => { if (readOnMount) refresh(); }, []);
  return (
    <>
      <div><button type="button" className={skin.button} disabled={busy} onClick={refresh}>{t('check.refresh')}</button></div>
      {findings === null ? null : findings.length === 0 ? <p className={skin.note}>{t('check.none')}</p> : (
        <>
          <p className={skin.note}>{t('check.count', { count: findings.length })}</p>
          {groupBySheet(findings, sheets).map((g) => (
            <div key={g.sheetId ?? 'none'} className="mb-3">
              <p className={skin.heading}>{g.title}</p>
              <ul className="m-0 list-none p-0">
                {g.findings.map((f, i) => (
                  <li key={`${f.kind}-${f.viewId ?? ''}-${f.draftId ?? ''}-${i}`} className="flex items-start justify-between gap-2 py-0.5">
                    {f.fill ? <FillField finding={f} skin={skin} onFilled={refresh} /> : <button type="button" className={skin.link} onClick={() => { if (goToFinding(f, nav)) onLeave?.(); }}>{describeFinding(f)}</button>}
                    {f.fix ? <button type="button" className={skin.fixButton} disabled={busy} onClick={() => { onLeave?.(); void fix(f, nav); }}>{t('check.fix')} {f.fix}</button> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </>
  );
}
