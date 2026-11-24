/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The first thing after a model opens: no empty page, the set is already
 * drawn. What was read, how many sheets and views, and the way onto the Wall.
 */

import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { formatLocaleFixed, useTranslation } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { useProjectStore } from '@/project/project-store';
import { TOUR_ANCHORS, tourAnchor } from '@/lib/tours/anchors';
import { RecoveryOffer } from './RecoveryOffer';
import { TemplateReport } from './SetTemplate';
import { ReadinessList } from '../sheets/ReadinessList';
import { WALL_SKIN } from '../sheets/set-skin';
import { WallSheet } from './WallSheet';
import { useIssue } from '../sheets/useIssue';
import { runAnnotateSet, useAnnotatePanel } from '@/annotate-set/store';
import { startWallFill } from '@/wall/wall-fill';

function Chip({ children }: { children: string }) {
  return <span className="rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100">{children}</span>;
}

/**
 * The two steps from a drawn set to a finished one, offered where the set arrives: annotate every drawing, and issue the
 * set as PDF. Both are the header's own actions with their defaults (Annotate the set, Issue the set), one click each.
 */
function IntroActions() {
  const { t } = useTranslation();
  const running = useAnnotatePanel((s) => s.running);
  const summary = useAnnotatePanel((s) => s.summary);
  const { busy, lines, issue } = useIssue();
  const added = summary?.views.reduce((n, v) => n + v.results.reduce((m, r) => m + r.added, 0), 0) ?? 0;
  const views = summary?.views.filter((v) => v.results.some((r) => r.added > 0)).length ?? 0;
  const quiet = 'rounded-md border border-sky-300/40 px-4 py-2 text-sm text-sky-50 hover:border-sky-300/80 disabled:opacity-50';
  return (
    // Its buttons keep their own Enter: the intro's Enter hangs the set.
    <div className="mt-4 max-w-lg" data-owns-keys data-testid="intro-actions">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={quiet} disabled={running !== null} onClick={() => void runAnnotateSet()}>{t('wall.introActions.annotate')}</button>
        <button type="button" className={quiet} disabled={busy || running !== null} onClick={() => void issue('pdf', { name: '', listFirst: true, archival: false })}>{t('issue.pdf')}</button>
      </div>
      <output className="mt-2 block text-xs leading-relaxed text-sky-200">
        {running ? t('wall.annotate.progress', { done: Math.min(running.done + 1, running.total), total: running.total, name: running.viewName }) : summary ? (added > 0 ? t('wall.introActions.annotated', { count: added, views }) : t('wall.introActions.nothing')) : null}
        {lines.map((l, i) => <span key={i} className="block">{l}</span>)}
      </output>
    </div>
  );
}

/** How many sheets the intro draws; the rest are counted in a line under them. */
const SHOWN = 6;
/** A drawn sheet's width on the intro, px: wide enough to tell a plan from an elevation. */
const THUMB_PX = 210;

/** The first sheets of the set as they are drawn, each a way into that sheet: the proof that the set is there, before any click. */
function IntroSheets({ sheets, onOpen }: { sheets: readonly ProjectSheet[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  // The set is drawn while the intro is read, in sheet order: the papers here fill in, and the overview opens already drawn.
  useEffect(() => startWallFill(), []);
  if (sheets.length === 0) return null;
  const rest = sheets.length - SHOWN;
  return (
    // Its buttons keep their own Enter: each opens its own sheet.
    <div className="shrink-0" data-owns-keys data-testid="intro-sheets">
      <div className="grid grid-cols-2 gap-4">
        {sheets.slice(0, SHOWN).map((sheet) => (
          <button key={sheet.id} type="button" title={t('wall.introSheets.open', { number: sheet.number, name: sheet.name })} onClick={() => onOpen(sheet.id)} className="group block rounded-sm text-left outline-none ring-sky-300 hover:ring-2 focus-visible:ring-2">
            <span className="pointer-events-none block overflow-hidden bg-white" style={{ width: THUMB_PX, height: (THUMB_PX * paperOf(sheet).h) / paperOf(sheet).w }}>
              <WallSheet sheet={sheet} width={THUMB_PX} pinned={false} deferDrawings />
            </span>
            <span className="mt-1 block w-[210px] truncate text-xs text-sky-200 group-hover:text-white"><span className="font-semibold text-white">{sheet.number}</span> {sheet.name}</span>
          </button>
        ))}
      </div>
      {rest > 0 ? <p className="mt-3 text-xs text-sky-200/80">{t('wall.introSheets.more', { count: rest })}</p> : null}
    </div>
  );
}

export function WallIntro({ modelName, extent, onHang, onOpenSheet }: { modelName: string; extent: ModelExtent; onHang: () => void; /** A sheet picked on the intro; absent, the sheets are not shown. */ onOpenSheet?: (id: string) => void }) {
  const { t, locale } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const levels = useProjectStore((s) => s.levels);
  const views = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId))).size;
  const w = formatLocaleFixed(locale, extent.max.x - extent.min.x, 1);
  const d = formatLocaleFixed(locale, extent.max.z - extent.min.z, 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Enter on a button of a panel that keeps its own keys (the tour card) is that button's.
      if (e.target instanceof Element && e.target.closest('[data-owns-keys]')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') onHang();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHang]);

  return (
    // Scrolls: with the warnings of a large model the page is taller than a small window, and its buttons were out of reach.
    <div className="h-full overflow-y-auto px-16">
      <div className="flex min-h-full flex-wrap items-center gap-x-16 gap-y-8 py-8">
      <div className="max-w-2xl">
        <RecoveryOffer onRestored={onHang} />
        <p className="mb-4 text-2xs font-medium uppercase tracking-widest text-sky-400">{t('wall.intro.read', { name: modelName })}</p>
        <h1 className="m-0 text-5xl font-light leading-tight text-white">
          {t('wall.intro.titleStart')}
          <br />
          <span className="text-sky-400">{t('wall.intro.titleEnd')}</span>
        </h1>
        <p className="mt-6 max-w-lg text-base leading-relaxed text-sky-100/80">{t('wall.intro.body', { views, sheets: sheets.length })}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Chip>{t('wall.intro.storeys', { count: levels.length })}</Chip>
          <Chip>{t('wall.intro.extent', { w, d })}</Chip>
          <Chip>{t('wall.intro.sheets', { count: sheets.length })}</Chip>
          <Chip>{t('wall.intro.views', { count: views })}</Chip>
        </div>
        <TemplateReport />
        <div className="mt-6 max-w-lg"><ReadinessList skin={WALL_SKIN} compact foldAs={(count) => t('wall.introSheets.check', { count })} /></div>
        <button type="button" {...tourAnchor(TOUR_ANCHORS.wallHang)} onClick={onHang} className="mt-8 inline-flex items-center gap-3 rounded-md bg-sky-600 px-5 py-2.5 text-base text-white hover:bg-sky-500">
          {t('wall.intro.hang')} <ArrowRight className="size-4" />
        </button>
        <IntroActions />
      </div>
      {onOpenSheet ? <IntroSheets sheets={sheets} onOpen={onOpenSheet} /> : null}
      </div>
    </div>
  );
}
