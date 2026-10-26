/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting command line: the last few history lines, the running
 * command's prompt, and an input for command names, coordinates
 * (`x,y`, `@dx,dy`, `@d<angle`), distances, values and keywords.
 */

import { forwardRef } from 'react';
import { useTranslation } from '@/i18n';
import { endCommand, submitCommandLine, useDraftingSession } from '@/drafting/session';

interface CommandLineProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onEscape: () => void;
}

export const CommandLine = forwardRef<HTMLInputElement, CommandLineProps>(function CommandLine({ value, onChange, onSubmit, onEscape }, ref) {
  const { t } = useTranslation();
  const history = useDraftingSession((s) => s.history);
  const prompt = useDraftingSession((s) => s.prompt);
  const running = useDraftingSession((s) => s.commandId !== null);
  const recent = history.slice(-3);
  const promptText = prompt ? t(prompt.key, prompt.params) : t('drafting.prompt.idle');
  return (
    <div className="shrink-0 min-w-0 overflow-hidden border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono text-xs">
      {/* Fixed height: a growing history would resize the drawing (which re-centres) under the cursor. */}
      <div className="h-12 overflow-hidden px-3 pt-1 text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {recent.map((line, i) => (
          <div key={i} className="truncate">
            {line.typed !== undefined ? `> ${line.typed}` : t(line.key, line.params)}
          </div>
        ))}
      </div>
      {prompt?.choices?.length ? (
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 px-3 pb-1" aria-label={promptText}>
          {prompt.choices.map((c) => (
            <button
              key={c.value}
              type="button"
              className="rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => submitCommandLine(c.value, null)}
            >
              {c.value} <span className="text-zinc-500 dark:text-zinc-400">{c.count}</span>
            </button>
          ))}
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 px-3 py-1.5">
        {/* A long prompt truncates (whole in its tooltip): it must never widen the drawing above. */}
        <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200" title={promptText}>{promptText}</span>
        <input
          ref={ref}
          data-command-line=""
          aria-label={t('drafting.commandLine')}
          className="min-w-32 flex-1 bg-transparent outline-none text-zinc-900 dark:text-zinc-100"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onEscape();
            } else if (e.key === ' ' && value.trim() === '') {
              // Space on an empty line repeats / confirms, as in CAD.
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        {/* Esc and Enter end a command; this button is for a keyboard without them (#166). */}
        {running ? <button type="button" className="shrink-0 rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800" onClick={endCommand}>{t('drafting.done')}</button> : null}
      </label>
    </div>
  );
});
