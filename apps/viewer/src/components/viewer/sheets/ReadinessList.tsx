/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the model lacks (`check/readiness.ts`), in the look of the set's
 * "What is missing" list (a `SetSkin`): each line says what the IFC is missing
 * and, unless `compact`, which feature is weaker for it. Read again when a
 * model opens or closes and after an edit (`mutationVersion`), not on every render.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { describeEffect, describeMissing } from '@/check/readiness-say';
import { modelReadiness } from '@/check/readiness';
import { currentModelFacts } from '@/check/readiness-read';
import { useViewerStore } from '@/store';
import type { SetSkin } from './set-skin';

/** The findings of the models open now; null while none is open (nothing to say yet). */
function useModelReadiness() {
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  return useMemo(() => {
    void mutationVersion; // an edit can add or remove what the facts count
    return models.size === 0 ? null : modelReadiness(currentModelFacts());
  }, [models, mutationVersion]);
}

export function ReadinessList({ skin, compact = false }: { skin: SetSkin; compact?: boolean }) {
  const { t } = useTranslation();
  const findings = useModelReadiness();
  if (findings === null) return null;
  if (findings.length === 0) return compact ? null : <p className={skin.note}>{t('ready.none')}</p>;
  return (
    <ul className="m-0 list-none p-0">
      {findings.map((f) => (
        <li key={f.kind} className="py-0.5">
          <p className={`m-0 ${compact ? skin.note : skin.heading}`}>{describeMissing(f)}</p>
          {compact ? null : <p className={`m-0 ${skin.note}`}>{describeEffect(f)}</p>}
        </li>
      ))}
    </ul>
  );
}
