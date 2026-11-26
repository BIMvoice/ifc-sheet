/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall while files opened together load (#863): one state naming every file, its size and whether it is read,
 * being read, waiting or could not be read. The set is laid out once the last one is in.
 */

import { Check, Minus, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from '@/i18n';
import type { BatchFileState, LoadBatch } from '@/hooks/ingest/load-batch';
import { formatBytes } from '@/lib/utils';
import { WALL_EYEBROW } from './wall-type';

const ICON: Record<Exclude<BatchFileState, 'loading'>, typeof Check> = { waiting: Minus, loaded: Check, failed: X };
const TONE: Record<BatchFileState, string> = { waiting: 'text-sky-200/50', loading: 'text-sky-300', loaded: 'text-emerald-400', failed: 'text-red-400' };

function StateIcon({ state }: { state: BatchFileState }) {
  if (state === 'loading') return <Spinner className={`shrink-0 ${TONE.loading}`} />;
  const Icon = ICON[state];
  return <Icon className={`size-4 shrink-0 ${TONE[state]}`} aria-hidden="true" />;
}

export function WallBatch({ batch }: { batch: LoadBatch }) {
  const { t } = useTranslation();
  return (
    <section data-testid="wall-batch" aria-live="polite" className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <p className={WALL_EYEBROW}>{t('wall.batch.title')}</p>
        <ul className="m-0 mt-5 list-none space-y-2 p-0">
          {batch.files.map((file, i) => {
            return (
              <li key={`${i}:${file.name}`} data-state={file.state} className="flex items-center gap-3 rounded-md border border-sky-300/20 bg-sky-400/5 px-4 py-3">
                <StateIcon state={file.state} />
                <span className="min-w-0 flex-1 truncate text-base text-white">{file.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-sky-200/70">{formatBytes(file.size)}</span>
                <span className={`w-28 shrink-0 text-right text-sm ${TONE[file.state]}`}>{t(`wall.batch.${file.state}`)}</span>
              </li>
            );
          })}
        </ul>
        <p className="m-0 mt-4 text-sm text-sky-200/80">{t('wall.batch.body')}</p>
      </div>
    </section>
  );
}
