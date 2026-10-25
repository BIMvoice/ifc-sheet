/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The class and material mapping of one view template (#31), in the view template list: one row per rule (what it matches, a swatch of
 * how it draws, its weight, fill, line colour and hatch), a form to add one, and the classes and materials of the loaded models that
 * no rule maps yet (a click maps one). The swatch is asked of the one styler (`style-rule-swatch.ts`); a change is written to the
 * template, so every drawing that follows it draws it.
 */

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { builtInPatterns } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { classNamesInModels } from '@/project/model-classes';
import { materialNamesInModels } from '@/project/materials';
import { mappedKeys, swatchStyle } from '@/project/style-rule-swatch';
import { useProjectStore } from '@/project/project-store';
import { addStyleRule, removeStyleRule, updateStyleRule } from '@/project/view-template-actions';
import { useViewerStore } from '@/store';
import { classKey, materialKey, type CategoryLineWeight, type ProjectViewTemplate, type StyleRule } from '@bimvoice/ifcsheet';
import { WALL_FIELD } from './wall-type';

const WEIGHTS: readonly CategoryLineWeight[] = ['heavy', 'medium', 'light', 'hairline'];
const WEIGHT_KEYS = {
  heavy: 'viewGraphics.weight.heavy', medium: 'viewGraphics.weight.medium', light: 'viewGraphics.weight.light', hairline: 'viewGraphics.weight.hairline',
} as const satisfies Record<CategoryLineWeight, TranslationKey>;
const KIND_KEYS = { class: 'wall.rules.class', material: 'wall.rules.material' } as const satisfies Record<StyleRule['by'], TranslationKey>;
const SMALL = `${WALL_FIELD} !mt-0 !w-auto !py-0.5 !text-xs`;
const splitNames = (text: string): string[] => text.split(';').map((n) => n.trim()).filter(Boolean);

/** A swatch: a cut face the way the template draws what the rule matches (fill, outline pen, a hatch drawn as diagonals). */
function Swatch({ template, rule, label }: { template: ProjectViewTemplate; rule: StyleRule; label: string }) {
  const s = swatchStyle(template, rule.by, rule.match[0] ?? '');
  return (
    <svg aria-label={label} viewBox="0 0 32 20" className="size-8 shrink-0" width={32} height={20} data-fill={s.fill ?? ''} data-stroke={s.stroke} data-weight={s.weight}>
      <rect x={2} y={2} width={28} height={16} fill={s.fill ?? 'none'} stroke={s.stroke} strokeWidth={Math.max(1, s.weight * 4)} />
      {rule.style.cutHatch ? [8, 14, 20, 26].map((x) => <line key={x} x1={x} y1={18} x2={x + 6} y2={2} stroke={s.stroke} strokeWidth={0.6} />) : null}
    </svg>
  );
}

function RuleRow({ template, rule, patterns, suggestions }: { template: ProjectViewTemplate; rule: StyleRule; patterns: readonly string[]; suggestions: string }) {
  const { t } = useTranslation();
  const change = (style: Partial<StyleRule['style']>) => updateStyleRule(template.id, rule.id, { style });
  const kind = t(KIND_KEYS[rule.by]);
  const name = rule.match.join('; ');
  return (
    <li className="flex flex-wrap items-center gap-1.5 border-t border-sky-300/10 py-1.5 first:border-t-0">
      <Swatch template={template} rule={rule} label={t('wall.rules.swatch', { name })} />
      <span className="w-20 shrink-0 whitespace-nowrap text-2xs uppercase tracking-wider text-sky-300">{kind}</span>
      <input
        key={`${rule.id}:${name}`} aria-label={t('wall.rules.matches', { kind })} defaultValue={name} list={suggestions}
        className={`${WALL_FIELD} !mt-0 !w-40 !py-0.5 !text-xs`}
        onBlur={(e) => { const next = splitNames(e.target.value); if (next.length > 0) updateStyleRule(template.id, rule.id, { match: next }); else e.target.value = name; }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {rule.by === 'class' ? (
        <select aria-label={t('wall.rules.weight', { name })} className={SMALL} value={rule.style.lineWeight ?? ''} onChange={(e) => change({ lineWeight: (e.target.value || undefined) as CategoryLineWeight | undefined })}>
          <option value="">{t('wall.gfx.weightSet')}</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{t(WEIGHT_KEYS[w])}</option>)}
        </select>
      ) : null}
      <input type="color" aria-label={t('wall.rules.fill', { name })} value={rule.style.fillColor ?? '#d4d4d8'} onChange={(e) => change({ fillColor: e.target.value })} className="h-6 w-7 cursor-pointer bg-transparent p-0" />
      {rule.style.fillColor ? <button type="button" aria-label={t('wall.rules.fillClear', { name })} onClick={() => change({ fillColor: undefined })} className="text-2xs text-sky-200 hover:text-white">×</button> : null}
      {rule.by === 'class' ? (
        <>
          <input type="color" aria-label={t('wall.rules.line', { name })} value={rule.style.lineColor ?? '#000000'} onChange={(e) => change({ lineColor: e.target.value })} className="h-6 w-7 cursor-pointer bg-transparent p-0" />
          {rule.style.lineColor ? <button type="button" aria-label={t('wall.rules.lineClear', { name })} onClick={() => change({ lineColor: undefined })} className="text-2xs text-sky-200 hover:text-white">×</button> : null}
        </>
      ) : null}
      <select aria-label={t('wall.rules.hatch', { name })} className={SMALL} value={rule.style.cutHatch ?? ''} onChange={(e) => change({ cutHatch: e.target.value || undefined })}>
        <option value="">{t('wall.rules.hatchNone')}</option>
        {patterns.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="button" aria-label={t('wall.rules.remove', { name })} onClick={() => removeStyleRule(template.id, rule.id)} className="ml-auto rounded p-1 text-sky-200 hover:bg-sky-400/20">
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function StyleRulesEditor({ template }: { template: ProjectViewTemplate }) {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const patterns = useMemo(() => [...new Set([...builtInPatterns(), ...parsePat(patternText).patterns].map((p) => p.name))], [patternText]);
  // What the loaded models hold: recomputed when a model is loaded or removed.
  const present = useMemo(() => ({ class: classNamesInModels(), material: materialNamesInModels() }), [models]); // eslint-disable-line react-hooks/exhaustive-deps
  const rules = template.graphics.styleRules ?? [];
  const [by, setBy] = useState<StyleRule['by']>('class');
  const [name, setName] = useState('');
  const listId = `rule-names-${template.id}`;
  const unmapped = (['class', 'material'] as const).flatMap((kind) => {
    const mapped = mappedKeys(template, kind);
    return present[kind].filter((n) => !mapped.has(kind === 'class' ? classKey(n) : materialKey(n))).map((n) => ({ kind, name: n }));
  });
  const add = () => {
    const names = splitNames(name);
    if (names.length === 0) return;
    addStyleRule(template.id, by, names);
    setName('');
  };
  return (
    <div className="mt-2">
      <p className="m-0 text-xs font-medium text-sky-100">{t('wall.rules.title')}</p>
      <p className="m-0 mt-1 text-xs leading-relaxed text-sky-200">{t('wall.rules.hint')}</p>
      <datalist id={listId}>{present[by].map((n) => <option key={n} value={n}>{n}</option>)}</datalist>
      {rules.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.rules.empty')}</p> : null}
      <ul className="m-0 mt-1 list-none p-0">
        {rules.map((rule) => <RuleRow key={rule.id} template={template} rule={rule} patterns={patterns} suggestions={listId} />)}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select aria-label={t('wall.rules.addKind')} className={SMALL} value={by} onChange={(e) => setBy(e.target.value as StyleRule['by'])}>
          <option value="class">{t('wall.rules.class')}</option>
          <option value="material">{t('wall.rules.material')}</option>
        </select>
        <input
          aria-label={t('wall.rules.addName')} list={listId} value={name} onChange={(e) => setName(e.target.value)} placeholder={by === 'class' ? 'IfcWall' : t('wall.rules.material')}
          className={`${WALL_FIELD} !mt-0 !w-40 !py-0.5 !text-xs`} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button type="button" onClick={add} disabled={splitNames(name).length === 0} className="rounded border border-sky-300/40 px-2 py-0.5 text-xs text-white hover:bg-sky-400/20 disabled:opacity-40">{t('wall.rules.add')}</button>
      </div>
      <p className="m-0 mt-2 text-2xs uppercase tracking-wider text-sky-300">{t('wall.rules.unmapped')}</p>
      {unmapped.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t(present.class.length + present.material.length === 0 ? 'wall.rules.noModel' : 'wall.rules.allMapped')}</p> : (
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-1 p-0">
          {unmapped.map((u) => (
            <li key={`${u.kind}:${u.name}`}>
              <button type="button" aria-label={t('wall.rules.mapIt', { kind: t(KIND_KEYS[u.kind]), name: u.name })} onClick={() => addStyleRule(template.id, u.kind, [u.name])} className="rounded-full border border-sky-300/30 px-2 py-0.5 text-xs text-sky-100 hover:bg-sky-400/20">
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
