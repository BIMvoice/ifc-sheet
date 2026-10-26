/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM findings of the models open now, for a project that opted in (#372): nothing is run, and nothing is
 * listed, otherwise. Read again a moment after a model opens or closes or an edit lands (the same inputs as the rest of
 * the readiness list), and only the latest read is kept: a read that finishes after the models changed is dropped.
 * Every list on screen shares one run per state of the models.
 */

import { useEffect, useState } from 'react';
import { runByggesaksbim } from '@/check/byggesaksbim';
import type { ReadinessFinding } from '@/check/readiness';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';

export const BYGGESAKSBIM_DEBOUNCE_MS = 250;

let last: { models: unknown; version: number; run: Promise<ReadinessFinding[]> } | null = null;

/** The run for this state of the models, started once however many lists ask. */
export function byggesaksbimRun(models: unknown, version: number): Promise<ReadinessFinding[]> {
  if (!last || last.models !== models || last.version !== version) last = { models, version, run: runByggesaksbim() };
  return last.run;
}

/** Forgets the shared run (a test starts from none). */
export function forgetByggesaksbimRun(): void {
  last = null;
}

export function useByggesaksbim(): ReadinessFinding[] {
  const opted = useProjectStore((s) => s.byggesaksbim === true);
  const models = useViewerStore((s) => s.models);
  const version = useViewerStore((s) => s.mutationVersion);
  const [found, setFound] = useState<ReadinessFinding[]>([]);
  useEffect(() => {
    if (!opted || models.size === 0) {
      setFound([]);
      return undefined;
    }
    let current = true;
    const timer = setTimeout(() => {
      byggesaksbimRun(models, version).then(
        (findings) => { if (current) setFound(findings); },
        (error: unknown) => { console.error('[ByggesaksBIM] the check could not be run', error); if (current) setFound([]); },
      );
    }, BYGGESAKSBIM_DEBOUNCE_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [opted, models, version]);
  return opted ? found : [];
}
