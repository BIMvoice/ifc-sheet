/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Tag tool shows on the next tag: the mark, the Name, the type's name or the class (#676). The choice is the
 * project's (`tagField`), so it is saved with the project and the tool starts from it on open. A tag type, when one is
 * chosen, brings its own field and takes precedence.
 */

import { TAG_FIELDS } from '@/catalogue/types';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { setTagFieldChoice } from '@/tagfields/tag-field-choice';
import type { TagField } from '@/tagfields/element-tag';
import { TAG_FIELD_WORDS } from '@/tagfields/tag-field-words';
import { patchDraftSettings } from '@/drafting/session';
import { WALL_FIELD } from './wall-type';

/** The words of the choices; the IFC attribute is named as the standard names it (Name). */
const OPTION: Record<TagField, TranslationKey> = {
  mark: 'tagShows.mark', name: 'tagShows.name', typeName: 'atype.tag.typeName', class: 'tagShows.class',
  classification: 'atype.tag.classification', classificationTitle: 'atype.tag.classificationTitle', custom: 'tagCustom.option',
};

/** The project keeps the choice; the session is told too, so a running tool's sentence follows it. */
function choose(field: TagField): void {
  setTagFieldChoice(field);
  patchDraftSettings({ tagField: field });
}

export function TagShows() {
  const { t } = useTranslation();
  const chosen: TagField = useProjectStore((s) => s.tagField) ?? 'mark';
  return (
    <div className="mt-4 text-xs text-sky-200">
      <label className="block">
        {t('tagShows.label')}
        <select className={WALL_FIELD} value={chosen} onChange={(e) => choose(e.target.value as TagField)}>
          {TAG_FIELDS.map((f) => <option key={f} value={f}>{t(OPTION[f])}</option>)}
        </select>
      </label>
      <output className="mt-1 block text-sky-100">{t('tagCard.sentence', { field: t(TAG_FIELD_WORDS[chosen]) })}</output>
      <span className="mt-1 block text-sky-300">{t('tagShows.hint')}</span>
    </div>
  );
}
