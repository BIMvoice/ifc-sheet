/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The library: export this project's reusable definitions to a `.bvlib`
 * file, or import one from another project under a rule for name clashes.
 */

import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from '@/components/ui/toast';
import { CATALOGUE_KINDS, type CatalogueKind } from '@/catalogue/catalogue-file';
import { kindCounts } from '@/catalogue/catalogue-counts';
import type { ClashPolicy, MergeReport } from '@/catalogue/catalogue-merge';
import { exportBuiltInLibrary, exportCatalogue, importCatalogueText, projectCatalogue } from '@/catalogue/catalogue-store';
import { GRAPHIC_STANDARDS } from '@/drafting/graphic-standard';
import { setGraphicStandard, useGraphicStandard } from '@/project/graphic-standard-actions';
import { useProjectStore } from '@/project/project-store';

function ExportSection() {
  const { t } = useTranslation();
  // The counts as one string: stable while they do not change, and live while the dialog is open.
  const counts = useProjectStore((s) => kindCounts(projectCatalogue(s)).join(',')).split(',').map(Number);
  const [kinds, setKinds] = useState<ReadonlySet<CatalogueKind>>(new Set(CATALOGUE_KINDS));
  const toggle = (k: CatalogueKind) => setKinds((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{t('library.export.title')}</h3>
      <p className="text-zinc-500">{t('library.export.hint')}</p>
      <ul className="space-y-1">
        {CATALOGUE_KINDS.map((k, i) => (
          <li key={k}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={kinds.has(k)} onChange={() => toggle(k)} />
              <span>{t(`library.kind.${k}` as TranslationKey)}</span>
              <span className="text-zinc-500 tabular-nums">({counts[i]})</span>
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" disabled={kinds.size === 0} onClick={() => { exportCatalogue(kinds); toast.success(t('library.export.done')); }}>
        {t('library.export.button')}
      </Button>
    </section>
  );
}

function ReportLines({ report }: { report: MergeReport }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5 text-zinc-600 dark:text-zinc-400" data-testid="library-report">
      {CATALOGUE_KINDS.map((k) => {
        const r = report[k];
        const empty = r.added + r.kept + r.replaced + r.renamed === 0;
        return (
          <li key={k}>
            <span className="font-medium">{t(`library.kind.${k}` as TranslationKey)}</span>: {empty ? t('library.report.none') : t('library.report', { ...r })}
          </li>
        );
      })}
    </ul>
  );
}

function ImportSection() {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<ClashPolicy>('mine');
  const [report, setReport] = useState<MergeReport | null>(null);
  const choose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bvlib,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const done = importCatalogueText(await file.text(), policy);
        setReport(done.report);
        toast.success(t('library.import.done', { name: done.name }));
      } catch (err) {
        setReport(null);
        toast.error(t('library.import.failed', { detail: err instanceof Error ? err.message : String(err) }));
      }
    };
    input.click();
  };
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{t('library.import.title')}</h3>
      <p className="text-zinc-500">{t('library.import.hint')}</p>
      <SegmentedControl size="sm" label={t('library.import.policy')} value={policy} onValueChange={setPolicy}
        options={(['mine', 'theirs', 'both'] as const).map((p) => ({ value: p, label: t(`library.import.${p}` as TranslationKey) }))} />
      <div><Button size="sm" onClick={choose}>{t('library.import.button')}</Button></div>
      {report ? <ReportLines report={report} /> : null}
    </section>
  );
}

/** The project's graphic standard: pens and text sizes of every sheet, from a built-in set. */
function StandardSection() {
  const { t } = useTranslation();
  const current = useGraphicStandard();
  return (
    <section className="col-span-2 space-y-2" data-testid="graphic-standard">
      <h3 className="font-medium">{t('library.standard.title')}</h3>
      <p className="text-zinc-500">{t('library.standard.hint')}</p>
      <SegmentedControl size="sm" label={t('library.standard.title')} value={current.id} onValueChange={setGraphicStandard}
        options={GRAPHIC_STANDARDS.map((g) => ({ value: g.id, label: g.name }))} />
      <div><Button size="sm" onClick={() => { exportBuiltInLibrary(current.id); toast.success(t('library.export.done')); }}>{t('library.standard.export')}</Button></div>
    </section>
  );
}

export function LibraryTab() {
  return (
    <div className="grid grid-cols-2 gap-8 text-xs">
      <StandardSection />
      <ExportSection />
      <ImportSection />
    </div>
  );
}
