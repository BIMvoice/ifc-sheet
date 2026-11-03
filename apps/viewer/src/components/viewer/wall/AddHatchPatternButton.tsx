/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Add a hatch pattern" (#671): the button beside every hatch choice that loads a `.pat` file into the project (it was
 * only on the Annotate ribbon, out of sight of the hatch card and the materials). The patterns join the project's
 * list, which is saved with it, and `onAdded` gets the first loaded name so the choice can take it at once.
 */

import { Plus } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { importHatchPatternFile } from '@/drafting/hatch-import';
import { WALL_PILL } from './wall-type';

export function AddHatchPatternButton({ onAdded, className = '' }: { onAdded: (firstName: string) => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button" data-add-hatch-pattern title={t('hatchadd.title')} className={`${WALL_PILL} inline-flex items-center gap-1 ${className}`}
      onClick={() => { void importHatchPatternFile().then((names) => { if (names[0]) onAdded(names[0]); }); }}
    >
      <Plus className="size-3" aria-hidden />
      {t('hatchadd.button')}
    </button>
  );
}
