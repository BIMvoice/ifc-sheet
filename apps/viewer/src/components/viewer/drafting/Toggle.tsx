/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { cn } from '@/lib/utils';

export function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('h-6 rounded-sm px-2 font-medium', active ? 'bg-primary/15 text-primary' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900')}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
