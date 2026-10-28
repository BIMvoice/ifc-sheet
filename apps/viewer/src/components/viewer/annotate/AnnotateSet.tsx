/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Annotate the set" in IfcSheet's top bar, and the panel it opens (#333). */

import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { choicesFrom, hasChoices, type AnnotateCommand } from '@/annotate-set/choices';
import { targetViews } from '@/annotate-set/annotate-set';
import { runAnnotateSet, stopAnnotateSet, switchCommand, useAnnotatePanel } from '@/annotate-set/store';
import { useProjectStore } from '@/project/project-store';
import { closeFrontPanel, setPanel, useWallNav } from '../wall/wall-nav';
import { WALL_PILL } from '../wall/wall-type';
import { AnnotateSummary } from './AnnotateSummary';

const CHOICES: readonly { command: AnnotateCommand; label: 'wall.annotate.tagall' | 'wall.annotate.dimall' | 'wall.annotate.levelall' }[] = [
  { command: 'tagall', label: 'wall.annotate.tagall' },
  { command: 'dimall', label: 'wall.annotate.dimall' },
  { command: 'levelall', label: 'wall.annotate.levelall' },
];

const frame = 'absolute inset-y-0 right-0 z-20 flex w-96 flex-col border-l border-sky-300/20 bg-[#08214a] text-sky-50 shadow-2xl';

function AnnotatePanel() {
  const { t } = useTranslation();
  const { on, running, summary } = useAnnotatePanel();
  // The views the choice runs on; read again when the set changes.
  useProjectStore((s) => s.views);
  const choices = choicesFrom(on);
  const views = targetViews(choices).length;
  return (
    <aside aria-label={t('wall.annotate.title')} className={frame}>
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <p className="m-0 min-w-0 flex-1 truncate text-base text-white">{t('wall.annotate.title')}</p>
        <button type="button" aria-label={t('wall.add.close')} onClick={closeFrontPanel} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-4" /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 text-sm">
        <p className="m-0 text-xs text-sky-200">{t('wall.annotate.hint')}</p>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0" disabled={running !== null}>
          {CHOICES.map(({ command, label }) => (
            <label key={command} className="flex items-center gap-2 text-sm text-white">
              <input type="checkbox" checked={on[command]} onChange={(e) => switchCommand(command, e.target.checked)} />
              <span>{t(label)}</span>
            </label>
          ))}
        </fieldset>
        {!hasChoices(choices) ? <p className="m-0 text-xs text-amber-300">{t('wall.annotate.nothingChosen')}</p> : views === 0 ? <p className="m-0 text-xs text-amber-300">{t('wall.annotate.noViews')}</p> : null}
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-50" disabled={running !== null || views === 0} onClick={() => void runAnnotateSet()}>{t('wall.annotate.run')}</button>
          {running ? <button type="button" className={WALL_PILL} onClick={stopAnnotateSet}>{t('wall.annotate.stop')}</button> : null}
        </div>
        {running ? <output className="m-0 block text-xs text-sky-200" data-testid="annotate-progress">{t('wall.annotate.progress', { done: Math.min(running.done + 1, running.total), total: running.total, name: running.viewName })}</output> : null}
        {summary ? <AnnotateSummary summary={summary} /> : null}
      </div>
    </aside>
  );
}

export function AnnotateSet() {
  const { t } = useTranslation();
  // One of the Wall's panels: opening it closes the others, and Esc closes it (#296).
  const open = useWallNav((s) => s.panel === 'annotate');
  return (
    <>
      <button type="button" aria-pressed={open} className={WALL_PILL} onClick={() => setPanel(open ? null : 'annotate')}>{t('wall.annotate.open')}</button>
      {open ? <AnnotatePanel /> : null}
    </>
  );
}
