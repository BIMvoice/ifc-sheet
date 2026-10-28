/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What is missing from the set (`check/`): a plain list grouped by sheet. A
 * line goes to its place when clicked; where one command fixes it, a button
 * runs that command on the view. The list is read when asked (or when it
 * appears), then follows the set (`useFindings`), so it shrinks as the set is finished. The one list for every surface
 * that shows it; a surface supplies its look and how it opens a place.
 */

import { useEffect } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
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

export function FindingList({ nav, skin, readOnMount = false, onLeave }: Props) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const { findings, busy, failure, refresh, fix, remove, reattach } = useFindings();
  useEffect(() => { if (readOnMount) refresh(); }, []);
  return (
    <>
      <div><button type="button" className={skin.button} disabled={busy} onClick={refresh}>{t('check.refresh')}</button></div>
      {failure ? <p role="alert" className={skin.note}>{t(`check.fix.${failure}` as TranslationKey)}</p> : null}
      {findings === null ? null : findings.length === 0 ? <p className={skin.note}>{t('check.none')}</p> : (
        <>
          <p className={skin.note}>{t('check.count', { count: findings.length })}</p>
          {groupBySheet(findings, sheets).map((g) => (
            <div key={g.sheetId ?? 'none'} className="mb-3">
              <p className={skin.heading}>{g.title}</p>
              <ul className="m-0 list-none p-0">
                {g.findings.map((f, i) => (
                  <li key={`${f.kind}-${f.viewId ?? ''}-${f.draftId ?? ''}-${i}`} className="flex items-start justify-between gap-2 py-0.5">
                    <button type="button" className={skin.link} onClick={() => { if (goToFinding(f, nav)) onLeave?.(); }}>{describeFinding(f)}</button>
                    {f.remedies?.length ? (
                      <span className="flex shrink-0 gap-1">
                        {f.remedies.includes('reattach') ? <button type="button" className={skin.fixButton} disabled={busy} title={t('check.remedy.reattachHint')} onClick={() => { onLeave?.(); void reattach(f, nav); }}>{t('check.remedy.reattach')}</button> : null}
                        {f.remedies.includes('delete') ? <button type="button" className={skin.fixButton} disabled={busy} title={t(f.kind === 'orphanedOverride' ? 'check.remedy.dropHint' : 'check.remedy.deleteHint')} onClick={() => remove(f)}>{t('check.remedy.delete')}</button> : null}
                      </span>
                    ) : null}
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
