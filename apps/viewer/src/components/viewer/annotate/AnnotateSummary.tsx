/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What annotating the set did to each view (#333): per command, what it added, that it found the view complete, or why it did nothing. */

import { useTranslation, type TranslationKey } from '@/i18n';
import type { SetSummary, ViewSummary } from '@/annotate-set/annotate-set';
import { COMMAND_LABEL } from '@/annotate-set/choices';
import type { CommandResult } from '@/annotate-set/run-view';

function ResultLine({ result }: { result: CommandResult }) {
  const { t } = useTranslation();
  const said = result.messages[0];
  const reason = result.outcome === 'skipped' ? (said ? t(said.key, said.params) : t('wall.annotate.reason.nothing')) : null;
  return (
    <li data-outcome={result.outcome} data-command={result.command} className="flex gap-2">
      <span className="w-20 shrink-0 font-mono text-sky-300">{t(COMMAND_LABEL[result.command])}</span>
      <span className="min-w-0">
        <span className={result.outcome === 'added' ? 'text-emerald-300' : 'text-sky-200/80'}>
          {result.outcome === 'added' ? t('wall.annotate.status.added', { count: result.added }) : result.outcome === 'already' ? t('wall.annotate.status.already') : t('wall.annotate.status.skipped')}
        </span>
        {reason ? <span className="text-sky-100/70">{`: ${reason}`}</span> : null}
      </span>
    </li>
  );
}

function ViewBlock({ view }: { view: ViewSummary }) {
  const { t } = useTranslation();
  return (
    <li className="py-1.5" data-testid="annotate-view" data-view={view.viewId}>
      <p className="m-0 truncate text-sm text-white">{view.name}</p>
      <ul className="m-0 mt-0.5 list-none space-y-0.5 p-0 text-xs">
        {view.skipped ? <li className="text-amber-300">{t(view.skipped.key as TranslationKey, view.skipped.params)}</li> : view.results.map((r) => <ResultLine key={r.command} result={r} />)}
      </ul>
    </li>
  );
}

export function AnnotateSummary({ summary }: { summary: SetSummary }) {
  const { t } = useTranslation();
  const done = summary.views.filter((v) => v.results.some((r) => r.added > 0)).length;
  return (
    <section aria-live="polite" data-testid="annotate-summary">
      <p className="m-0 text-sm text-white">{t('wall.annotate.result.total', { added: summary.added, views: done, total: summary.views.length })}</p>
      {summary.cancelled ? <p className="m-0 mt-1 text-xs text-amber-300">{t('wall.annotate.result.stopped')}</p> : null}
      <ul className="m-0 mt-2 list-none divide-y divide-sky-300/10 p-0">
        {summary.views.map((v) => <ViewBlock key={v.viewId} view={v} />)}
      </ul>
    </section>
  );
}
