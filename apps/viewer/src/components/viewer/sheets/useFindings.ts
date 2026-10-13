/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing from the set, as a list to show: read on demand, with a fix that runs and reads again. */

import { useState } from 'react';
import { currentFindings } from '@/check/collect';
import { fixFinding, type FindingNav } from '@/check/go';
import type { Finding } from '@/check/types';

export interface FindingsState {
  /** `null` until it was read once. */
  findings: Finding[] | null;
  busy: boolean;
  refresh: () => void;
  /** Open the finding's place and run its command there, then read again. */
  fix: (finding: Finding, nav: FindingNav) => Promise<void>;
}

export function useFindings(): FindingsState {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setFindings(currentFindings());
  const fix = async (finding: Finding, nav: FindingNav) => {
    setBusy(true);
    try {
      await fixFinding(finding, nav);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  return { findings, busy, refresh, fix };
}
