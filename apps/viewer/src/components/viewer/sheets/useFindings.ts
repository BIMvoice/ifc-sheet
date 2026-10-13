/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing from the set, as a list to show: read on demand, with a fix that runs and reads again. */

import { useState } from 'react';
import { currentFindings } from '@/check/collect';
import type { Finding } from '@/check/types';

export interface FindingsState {
  /** `null` until it was read once. */
  findings: Finding[] | null;
  busy: boolean;
  refresh: () => void;
  /** Run `fix` (which opens the place and runs the finding's command), then read again. */
  fix: (finding: Finding, fix: (finding: Finding) => Promise<boolean>) => Promise<void>;
}

export function useFindings(): FindingsState {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setFindings(currentFindings());
  const fix = async (finding: Finding, run: (finding: Finding) => Promise<boolean>) => {
    setBusy(true);
    try {
      await run(finding);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  return { findings, busy, refresh, fix };
}
