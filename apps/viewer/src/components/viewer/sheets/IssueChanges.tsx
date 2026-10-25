/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What changed since the last issue (#331), in the issue panel before issuing: the sheets added, removed and
 * changed against the previous record, and the offer to put a revision on the changed sheets that have none new.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { addRevisionToSheets } from '@/issue/changes-actions';
import type { IssueChanges as Changes } from '@/issue/changes';
import { planFor } from '@/issue/run';
import { useProjectStore } from '@/project/project-store';
import type { ChangedSheet } from '@/issue/types';
import type { SetSkin } from './set-skin';

/** The comparison for the project as it stands, kept current as the project changes. */
export function useIssueChanges(date: string): Changes {
  const views = useProjectStore((s) => s.views);
  const sheets = useProjectStore((s) => s.sheets);
  const schedules = useProjectStore((s) => s.schedules);
  const legends = useProjectStore((s) => s.legends);
  const civilDrawings = useProjectStore((s) => s.civilDrawings);
  const drafts = useProjectStore((s) => s.drafts);
  const revisions = useProjectStore((s) => s.revisions);
  const issues = useProjectStore((s) => s.issues);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the plan reads the store; these are the parts the comparison depends on.
  return useMemo(() => planFor({ date }).changes, [date, views, sheets, schedules, legends, civilDrawings, drafts, revisions, issues]);
}

const listed = (sheets: readonly ChangedSheet[]) => sheets.map((s) => `${s.number} ${s.title}`).join(', ');

export function IssueChanges({ skin, date }: { skin: SetSkin; date: string }) {
  const { t } = useTranslation();
  const changes = useIssueChanges(date);
  const { status, against, added, removed, changed, unbumped } = changes;
  const name = against?.name ?? '';
  const groups = [['issue.changes.added', added], ['issue.changes.removed', removed], ['issue.changes.changed', changed]] as const;
  return (
    <section aria-label={t('issue.changes.title', { name })} className="flex flex-col gap-1" data-issue-changes={status}>
      {status === 'first' ? <p className={skin.note}>{t('issue.changes.first')}</p> : null}
      {status === 'unknown' ? <p className={skin.note}>{t('issue.changes.unknown')}</p> : null}
      {status === 'compared' ? <p className={skin.heading}>{t('issue.changes.title', { name })}</p> : null}
      {status === 'compared' && added.length + removed.length + changed.length === 0 ? <p className={skin.note}>{t('issue.changes.none', { name })}</p> : null}
      {status === 'compared' ? groups.map(([key, list]) => (list.length > 0 ? <p key={key} className={skin.note}>{t(key, { count: list.length, sheets: listed(list) })}</p> : null)) : null}
      {unbumped.length > 0 ? (
        <>
          <button type="button" className={skin.button} onClick={() => addRevisionToSheets(unbumped.map((u) => u.sheetId), date)}>{t('issue.changes.bump', { count: unbumped.length })}</button>
          <p className={skin.note}>{t('issue.changes.bumpHint', { count: unbumped.length })}</p>
        </>
      ) : null}
      {status === 'compared' ? <p className={skin.note}>{t('issue.changes.note')}</p> : null}
    </section>
  );
}
