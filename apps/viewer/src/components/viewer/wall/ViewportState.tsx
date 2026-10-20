/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's state on screen: generating (with the generator's progress when
 * it reports any), failed (with why), nothing cut at this height (a plan), or
 * nothing seen (an elevation or a section, which have no cut height). The one
 * component the Wall, the stepped sheet and the project drawer all use.
 *
 * Screen only. It is HTML laid beside the paper's SVG, never inside it, so the
 * exports (which serialise that SVG) cannot carry it.
 */

import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from '@/i18n';
import type { ViewportState as State } from '@/project/viewport-state';

export function ViewportState({ state, compact = false }: { state: State; compact?: boolean }) {
  const { t } = useTranslation();
  if (state.kind === 'idle' || state.kind === 'ready') return null;
  let text: string;
  if (state.kind === 'generating') {
    const what = state.phase || t('wall.vpState.generating');
    text = state.percent === null ? what : `${what} ${state.percent}%`;
  } else if (state.kind === 'failed') text = state.reason ? t('wall.vpState.failedWhy', { reason: state.reason }) : t('wall.vpState.failed');
  else if (state.kind === 'emptyCut') text = t('wall.vpState.emptyCut');
  else text = t('wall.vpState.emptyView');
  const tone = state.kind === 'failed' ? 'text-red-700' : 'text-zinc-700';
  if (compact) {
    return (
      <output data-viewport-state={state.kind} title={text} className={`flex min-w-0 items-center gap-1 text-xs ${state.kind === 'failed' ? 'text-red-300' : 'text-sky-200'}`}>
        {state.kind === 'generating' ? <Spinner className="size-3 shrink-0" /> : null}
        <span className="truncate">{text}</span>
      </output>
    );
  }
  return (
    <output data-viewport-state={state.kind} className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden p-2 text-center">
      <span className={`flex max-w-full items-center gap-2 rounded-md bg-white/90 px-3 py-1 text-xs shadow ${tone}`}>
        {state.kind === 'generating' ? <Spinner className="size-3.5 shrink-0" /> : null}
        <span className="break-words">{text}</span>
      </span>
    </output>
  );
}
