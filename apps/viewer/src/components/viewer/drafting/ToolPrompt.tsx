/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the running tool wants next, in one sentence under the drawing, with its
 * choices as buttons and Done next to it. This is the drawing's answer to the
 * AutoCAD command line while AutoCAD mode is off (#168): no history, no typed
 * field. It shows only while a tool runs.
 */

import { forwardRef } from 'react';
import { useTranslation } from '@/i18n';
import { usePlainT } from '@/lib/commands/plain-texts';
import { useAutocadMode } from '@/lib/commands/autocad-mode';
import { CommandLine, TEXT_PROMPTS, type CommandLineProps } from './CommandLine';
import { endCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';

const BUTTON = 'shrink-0 rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800';

export function ToolPrompt() {
  const { t } = useTranslation();
  const plain = usePlainT();
  const prompt = useDraftingSession((s) => s.prompt);
  const running = useDraftingSession((s) => s.commandId !== null);
  if (!running) return null;
  const text = prompt ? plain(prompt.key, prompt.params) : '';
  return (
    <div data-tool-prompt="" className="flex shrink-0 min-w-0 flex-wrap items-center gap-2 overflow-hidden border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
      <output aria-live="polite" className="min-w-0 flex-1 truncate" title={text}>{text}</output>
      {prompt?.choices?.map((c) => (
        <button key={c.value} type="button" className={BUTTON} onClick={() => submitCommandLine(c.value, null)}>
          {c.value} <span className="text-zinc-500 dark:text-zinc-400">{c.count}</span>
        </button>
      ))}
      <button type="button" className={BUTTON} onClick={endCommand}>{t('drafting.done')}</button>
    </div>
  );
}

/**
 * The bottom of the drawing. The AutoCAD command line shows with AutoCAD mode on, or while a text is being typed (there is no other field for it yet);
 * otherwise the running tool's next step shows as one sentence with Done (#168).
 */
export const DraftingPrompt = forwardRef<HTMLTextAreaElement, CommandLineProps>(function DraftingPrompt(props, ref) {
  const autocad = useAutocadMode((s) => s.on);
  const typingText = useDraftingSession((s) => s.prompt !== null && TEXT_PROMPTS.includes(s.prompt.key));
  return autocad || typingText ? <CommandLine ref={ref} {...props} /> : <ToolPrompt />;
});
