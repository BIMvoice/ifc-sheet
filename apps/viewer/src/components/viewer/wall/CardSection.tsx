/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One section of the viewport card as a disclosure (#290): a heading that is a button (`aria-expanded`, `aria-controls` through
 * the Collapsible) over a panel. Closed, the heading says in one line what the section holds. The section keeps its keys
 * (`data-owns-keys`), as the panels it wraps did, and the heading is a control like any other, so drafting's single-key tools
 * (#224) and the nudge guard (#281) leave it alone.
 */

import { useState, type ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { setSectionOpen, useSectionChoice } from './card-section-state';

interface CardSectionProps {
  /** Stable name of the section, the key its open or closed state is kept under. */
  id: string;
  title: string;
  /** What the section holds, in one line, shown while it is closed. */
  summary: string;
  /** Open until the user chooses: the section has a warning or settings off the default. Mount the section per schedule (`key`). */
  defaultOpen: boolean;
  /** The warning look of the heading (amber). */
  warn?: boolean;
  children: ReactNode;
}

export function CardSection({ id, title, summary, defaultOpen, warn = false, children }: CardSectionProps) {
  // A section the default opened stays open when the default lapses (a fix was just clicked: the card keeps showing the result),
  // and opens when a default turns on while it is closed (a gap appeared). A choice made by hand outranks both.
  const [autoOpen, setAutoOpen] = useState(defaultOpen);
  if (defaultOpen && !autoOpen) setAutoOpen(true);
  const open = useSectionChoice(id) ?? autoOpen;
  return (
    <Collapsible open={open} onOpenChange={(next) => setSectionOpen(id, next)} data-owns-keys className="mt-4 border-t border-sky-300/20 pt-4">
      <h3 className="m-0 font-normal">
        <CollapsibleTrigger className="flex w-full items-start gap-2 rounded-md border-0 bg-transparent p-0 text-left">
          <span aria-hidden className={`mt-px text-xs text-sky-200 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          <span className="min-w-0 flex-1">
            <span className={`block text-2xs font-medium uppercase tracking-widest ${warn ? 'text-amber-300' : 'text-cyan-400'}`}>{title}</span>
            {open ? null : <span className="mt-0.5 block text-xs text-sky-200">{summary}</span>}
          </span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
