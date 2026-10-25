/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing from the set, as a list to show: read on demand, with a fix that runs and reads again. */

import { useState } from 'react';
import { currentFindings } from '@/check/collect';
import { fixOutcome, reattachOutcome, removeFindingAnnotation, type FindingNav, type FixOutcome } from '@/check/go';
import type { Finding } from '@/check/types';

export interface FindingsState {
  /** `null` until it was read once. */
  findings: Finding[] | null;
  busy: boolean;
  /** Why the last fix did not run; null when it did, or none was tried. */
  failure: Exclude<FixOutcome, 'done'> | null;
  refresh: () => void;
  /** Open the finding's place and run its command there, then read again. */
  fix: (finding: Finding, nav: FindingNav) => Promise<void>;
  /** Take the finding's annotation off the drawing, then read again. */
  remove: (finding: Finding) => void;
  /** Go to the finding's annotation and start REATTACH there. */
  reattach: (finding: Finding, nav: FindingNav) => Promise<void>;
}

export function useFindings(): FindingsState {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FindingsState['failure']>(null);
  const refresh = () => setFindings(currentFindings());
  const fix = async (finding: Finding, nav: FindingNav) => {
    setBusy(true);
    try {
      const outcome = await fixOutcome(finding, nav);
      setFailure(outcome === 'done' ? null : outcome);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const remove = (finding: Finding) => {
    removeFindingAnnotation(finding);
    refresh();
  };
  const reattach = async (finding: Finding, nav: FindingNav) => {
    setBusy(true);
    try {
      const outcome = await reattachOutcome(finding, nav);
      setFailure(outcome === 'done' ? null : outcome);
    } finally {
      setBusy(false);
    }
  };
  return { findings, busy, failure, refresh, fix, remove, reattach };
}
