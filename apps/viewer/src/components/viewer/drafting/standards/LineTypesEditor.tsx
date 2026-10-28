/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The line-type editor: the project's own dash patterns, in paper
 * millimetres (dash, gap, dash, gap...). A layer or a drafted line picks
 * them by name next to the built-in types; a pattern that is not pairs of
 * lengths is refused where it is typed.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useProjectStore } from '@/project/project-store';
import { addLineType, removeLineType, updateLineType } from '@/project/drafting-standards';
import { formatDashPattern, parseDashPattern, type CustomLineType } from '@/drafting/line-types';

const INPUT = 'h-7 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

function Row({ type }: { type: CustomLineType }) {
  const { t } = useTranslation();
  const [bad, setBad] = useState(false);
  return (
    <li className="flex items-center gap-2">
      <input aria-label={t('standards.lineTypes.name')} className={`${INPUT} w-36`} defaultValue={type.name} key={type.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== type.name && updateLineType(type.id, { name: e.target.value.trim() })} />
      <input aria-label={`${type.name} · ${t('standards.lineTypes.pattern')}`} aria-invalid={bad} className={`${INPUT} w-40 ${bad ? 'border-red-500' : ''}`}
        defaultValue={formatDashPattern(type.dash)} key={formatDashPattern(type.dash)}
        onChange={() => setBad(false)}
        onBlur={(e) => {
          const dash = parseDashPattern(e.target.value);
          if (!dash) { setBad(true); return; }
          if (formatDashPattern(dash) !== formatDashPattern(type.dash)) updateLineType(type.id, { dash });
        }} />
      <svg aria-hidden="true" width={64} height={8} className="shrink-0"><line x1={0} y1={4} x2={64} y2={4} stroke="currentColor" strokeWidth={1.5} strokeDasharray={type.dash.map((d) => Math.max(d * 3, 0.5)).join(' ')} /></svg>
      {bad ? <span role="alert" className="text-red-600">{t('standards.lineTypes.invalid')}</span> : null}
      <span className="flex-1" />
      <IconButton label={t('standards.lineTypes.delete', { name: type.name })} className="size-7" onClick={() => removeLineType(type.id)}><Trash2 className="size-3.5" /></IconButton>
    </li>
  );
}

export function LineTypesEditor() {
  const { t } = useTranslation();
  const types = useProjectStore((s) => s.lineTypes) ?? [];
  return (
    <section className="space-y-2" aria-label={t('standards.lineTypes.title')}>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">{t('standards.lineTypes.title')}</h3>
        <Button size="sm" variant="outline" onClick={() => addLineType(t('standards.lineTypes.newName', { n: types.length + 1 }), [6, 2])}>
          <Plus className="mr-1 size-3.5" />{t('standards.lineTypes.add')}
        </Button>
        <p className="flex-1 text-right text-zinc-500">{t('standards.lineTypes.hint')}</p>
      </div>
      <ul className="space-y-1">{types.map((l) => <Row key={l.id} type={l} />)}</ul>
    </section>
  );
}
