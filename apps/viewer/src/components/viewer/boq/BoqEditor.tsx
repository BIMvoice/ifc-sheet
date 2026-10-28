/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities' mapping table (#75): one block per article, an empty table to begin with. IfcSheet ships no norm and no article code; the
 * office types its own. The result beside each article is the engine's sum on the loaded models, read as the table is edited.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { addBoqArticle } from '@/boq/boq-actions';
import { WALL_PILL } from '../wall/wall-type';
import { BoqArticleRow } from './BoqArticleRow';
import { useBoqArticles, useBoqElements, useBoqResult } from './useBoq';

const sorted = (values: Iterable<string | null>): string[] => [...new Set([...values].filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

export function BoqEditor() {
  const { t } = useTranslation();
  const articles = useBoqArticles();
  const elements = useBoqElements();
  const result = useBoqResult();
  // What the model has to choose from; a free word is accepted too (a type the model does not have yet).
  const options = useMemo(() => ({
    types: sorted(elements.map((e) => e.typeName)), materials: sorted(elements.flatMap((e) => e.materials)), classes: sorted(elements.map((e) => e.ifcClass.replace(/(StandardCase|ElementedCase)$/, ''))),
  }), [elements]);
  return (
    <section aria-label={t('boq.editor.title')}>
      <p className="m-0 max-w-3xl text-sm text-sky-200">{t('boq.editor.intro')}</p>
      {articles.length === 0 ? <p className="mt-4 text-sm text-sky-100">{t('boq.editor.empty')}</p> : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {articles.map((a, i) => <BoqArticleRow key={a.id} article={a} n={i + 1} line={result.lines[i]} options={options} />)}
        </ol>
      )}
      <button type="button" className={`${WALL_PILL} mt-4`} onClick={() => addBoqArticle()}>{t('boq.editor.add')}</button>
    </section>
  );
}
