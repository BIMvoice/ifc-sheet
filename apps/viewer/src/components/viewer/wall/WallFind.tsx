/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The search box on the Wall: type a sheet number, a sheet name or the name of a
 * drawing on it; Enter (or a click on a result) takes the Wall to the sheet and
 * flashes it. Up and Down choose among the results, Escape clears.
 */

import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { findSheets, type SheetHit } from '@/wall/wall-find';
import { revealSheet } from '@/wall/wall-view';

const MAX_RESULTS = 8;

export function WallFind() {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const schedules = useProjectStore((s) => s.schedules);
  const civil = useProjectStore((s) => s.civilDrawings);
  const legends = useProjectStore((s) => s.legends);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(0);
  const listId = useId();
  const names = useMemo(() => new Map([...views, ...(schedules ?? []), ...(civil ?? []), ...(legends ?? [])].map((x) => [x.id, x.name])), [views, schedules, civil, legends]);
  const hits = useMemo(() => findSheets(query, sheets, (id) => names.get(id)).slice(0, MAX_RESULTS), [query, sheets, names]);
  const sheetOf = (hit: SheetHit) => sheets.find((s) => s.id === hit.sheetId);

  const go = (hit: SheetHit | undefined) => {
    if (!hit) return;
    revealSheet(hit.sheetId);
    setQuery('');
  };

  return (
    <div data-owns-keys data-wall-find className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sky-300/70" />
      <input
        type="search"
        aria-controls={listId}
        aria-label={t('wall.find.label')}
        placeholder={t('wall.find.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go(hits[chosen]);
          else if (e.key === 'ArrowDown') setChosen((c) => Math.min(c + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setChosen((c) => Math.max(c - 1, 0));
          else if (e.key === 'Escape') setQuery('');
          else return;
          e.preventDefault();
        }}
        className="w-64 rounded-full border border-sky-300/30 bg-transparent py-1 pl-9 pr-3 text-sm text-sky-50 placeholder:text-sky-300/50 outline-none focus:border-sky-300/70"
      />
      {query.trim() ? (
        <ul id={listId} aria-label={t('wall.find.results')} className="absolute right-0 top-full z-20 mt-1 max-h-72 w-80 list-none overflow-auto rounded-md border border-sky-300/30 bg-[#0a2548] p-1 shadow-lg">
          {hits.length === 0 ? <li className="px-3 py-2 text-sm text-sky-200/70">{t('wall.find.none')}</li> : null}
          {hits.map((hit, i) => {
            const sheet = sheetOf(hit);
            return sheet ? (
              <li key={hit.sheetId}>
                <button
                  type="button"
                  aria-current={i === chosen || undefined}
                  onClick={() => go(hit)}
                  className={`flex w-full items-baseline gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-sky-300/10 ${i === chosen ? 'bg-sky-300/15' : ''}`}
                >
                  <span className="font-semibold text-white">{sheet.number}</span>
                  <span className="truncate text-sky-200/80">{sheet.name}</span>
                  {hit.via === 'view' ? <span className="ml-auto truncate text-xs text-sky-300/70">{hit.viewName}</span> : null}
                </button>
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
    </div>
  );
}
