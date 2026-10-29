/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTranslation, type TranslationKey } from '@/i18n';
import { permitPackOf, setPermitPack, useProjectStore, type PermitPack } from '@/project/project-store';
import type { DrawerSection } from './types';

const PACKS: readonly PermitPack[] = ['pacFull', 'pacRural', 'norway', 'germany'];

/**
 * The permit pack of the project, ONE choice: the PAC permit project, the simplified PAC, the Norwegian building application or the
 * German Bauantrag. A radio group written through `setPermitPack`, which turns the others off in the same update, so two cannot be on.
 * The default is the PAC permit project (a project that never chose is stored as absent).
 */
function PermitPackChoice() {
  const { t } = useTranslation();
  const pack = useProjectStore((s) => permitPackOf(s));
  return (
    <section className="border-t border-sky-300/10 px-4 py-3">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('permitPack.label')}</legend>
        {PACKS.map((p) => (
          <label key={p} className="flex items-center gap-2 py-0.5 text-xs text-white">
            <input type="radio" name="permit-pack" data-permit-pack={p} checked={pack === p} onChange={() => setPermitPack(p)} />
            <span>{t(`permitPack.${p}` as TranslationKey)}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}

/** The one choice of permit pack (#372). */
export const permitPackSection: DrawerSection = { id: 'permit-pack', slot: 'body', order: 158, component: PermitPackChoice };
