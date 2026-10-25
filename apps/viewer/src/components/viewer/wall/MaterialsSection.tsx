/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project drawer's Materials section (#90): the building materials of the loaded models, each with a swatch of how it
 * draws where a view cuts it and the settings that change it on every sheet, view and DXF. The table is the project's
 * (`project/materials.ts`); a material with no row of its own shows what its name suggests, and an edit makes the row.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { builtInPatterns } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { materialGraphics, materialNamesInModels, resetAllMaterials } from '@/project/materials';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { CardSection } from './CardSection';
import { MaterialRow } from './MaterialRow';
import { WALL_PILL } from './wall-type';

export function MaterialsSection() {
  const { t } = useTranslation();
  const table = useProjectStore((s) => s.materials);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const models = useViewerStore((s) => s.models);
  const edits = useViewerStore((s) => s.mutationVersion);
  const names = useMemo(() => {
    void models; void edits; void table;
    return materialNamesInModels();
  }, [models, edits, table]);
  const patterns = useMemo(() => parsePat(patternText).patterns, [patternText]);
  const hatchNames = useMemo(() => [...new Set([...builtInPatterns(), ...patterns].map((p) => p.name))], [patterns]);
  const rows = useMemo(() => names.map((n) => ({ ...materialGraphics(n, table ?? []), name: n })), [names, table]);
  const changed = rows.filter((r) => !r.auto).length;
  return (
    <div className="px-4 pb-3" data-materials-section>
      <CardSection id="drawer.materials" title={t('materials.title')} summary={t('wall.materials.summary', { count: rows.length, changed })} defaultOpen={false}>
        <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('materials.hint')}</p>
        {rows.length === 0 ? <p className="m-0 mt-2 text-xs text-sky-300">{t('wall.materials.none')}</p> : (
          <>
            <ul className="m-0 mt-2 list-none p-0">
              {rows.map((m) => <MaterialRow key={m.name} material={m} patterns={patterns} hatchNames={hatchNames} />)}
            </ul>
            <button type="button" className={`${WALL_PILL} mt-2`} disabled={changed === 0} onClick={resetAllMaterials}>{t('wall.materials.resetAll')}</button>
          </>
        )}
      </CardSection>
    </div>
  );
}
