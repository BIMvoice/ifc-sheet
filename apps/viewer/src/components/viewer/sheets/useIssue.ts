/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Issuing the set from a panel: run it in the chosen format, say what happened, hand the result over. */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { scheduleWorkbooks } from '@/issue/handover-collect';
import { useScheduleExportLabels } from '../wall/ScheduleExportButtons';
import { deliver, runIssue, type IssueFormat } from '@/issue/run';

export interface IssueState {
  busy: boolean;
  /** What was said, in words. */
  lines: string[];
  issue: (format: IssueFormat, options: { name: string; date?: string; listFirst: boolean; archival: boolean; currentCloudsOnly?: boolean }) => Promise<void>;
}

export function useIssue(): IssueState {
  const { t } = useTranslation();
  const labels = useScheduleExportLabels();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const issue: IssueState['issue'] = async (format, options) => {
    setBusy(true);
    setLines([]);
    try {
      const result = await runIssue({ format, ...options, handoverSchedules: () => scheduleWorkbooks(labels) });
      setLines([...result.lines.map((l) => t(l.key, l.params)), ...(result.files ? [t('handover.msg.done', { count: result.files.length, name: result.plan.name })] : [])]);
      if (result.lines.at(-1)?.key === 'issue.msg.done') deliver(result, format);
    } catch (err) {
      setLines([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };
  return { busy, lines, issue };
}
