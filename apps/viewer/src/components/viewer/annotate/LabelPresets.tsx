/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The label presets (#828) in the annotate panel: the saved ones with their groups and conditions, and a small form to add one. A preset is run with LABELALL. */

import { X } from 'lucide-react';
import { useState } from 'react';
import { describeFilter, LABEL_FILTER_KINDS, type LabelFilter, type LabelFilterKind, type LabelPresetGroup } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { deleteLabelPreset, saveLabelPreset } from '@/labels/label-presets-store';
import { useProjectStore } from '@/project/project-store';
import { WALL_PILL } from '../wall/wall-type';

const field = 'min-w-0 rounded border border-sky-300/30 bg-transparent px-2 py-1 text-xs text-white';
const KIND_LABEL = { class: 'labelPreset.by.class', type: 'labelPreset.by.type', material: 'labelPreset.by.material', classification: 'labelPreset.by.classification', property: 'labelPreset.by.property' } as const;

interface Draft { labelType: string; filters: LabelFilter[] }
const blank = (labelType = ''): Draft => ({ labelType, filters: [{ by: 'class', value: '' }] });

export function LabelPresets() {
  const { t } = useTranslation();
  const presets = useProjectStore((s) => s.labelPresets) ?? [];
  const labelTypes = (useProjectStore((s) => s.annotationTypes) ?? []).filter((a) => a.tool === 'label' && a.label);
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<Draft[]>([blank()]);
  const setGroup = (i: number, g: Draft) => setGroups(groups.map((x, j) => (j === i ? g : x)));
  const setFilter = (i: number, k: number, f: LabelFilter) => setGroup(i, { ...groups[i], filters: groups[i].filters.map((x, j) => (j === k ? f : x)) });
  const changeKind = (i: number, k: number, by: LabelFilterKind) => setFilter(i, k, by === 'property' ? { by, set: '', name: '', value: '' } : { by, value: '' });
  const ready = name.trim() !== '' && groups.every((g) => g.labelType !== '' && g.filters.length > 0);
  const save = () => {
    if (saveLabelPreset(name, groups as LabelPresetGroup[])) {
      setName('');
      setGroups([blank()]);
    }
  };
  return (
    <section aria-label={t('labelPreset.title')} className="flex flex-col gap-1.5 border-t border-sky-300/20 pt-3" data-testid="label-presets">
      <p className="m-0 text-xs text-sky-200">{t('labelPreset.title')}</p>
      <p className="m-0 text-xs text-sky-300">{t('labelPreset.hint')}</p>
      {presets.map((p) => (
        <div key={p.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1 text-xs text-white">
            <p className="m-0">{p.name}</p>
            {p.groups.map((g, i) => <p key={i} className="m-0 text-sky-200">{g.labelType}: {g.filters.map(describeFilter).join(' + ')}</p>)}
          </div>
          <button type="button" aria-label={t('labelPreset.delete', { name: p.name })} onClick={() => deleteLabelPreset(p.id)} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-3" /></button>
        </div>
      ))}
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('labelPreset.name')} placeholder={t('labelPreset.name')} className={field} />
      {groups.map((g, i) => (
        <fieldset key={i} className="m-0 flex flex-col gap-1 rounded border border-sky-300/20 p-2">
          <legend className="px-1 text-xs text-sky-200">{t('labelPreset.group', { n: i + 1 })}</legend>
          <select value={g.labelType} onChange={(e) => setGroup(i, { ...g, labelType: e.target.value })} aria-label={t('labelPreset.labelType')} className={field}>
            <option value="">{t('labelPreset.labelType')}</option>
            {labelTypes.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
          {g.filters.map((f, k) => (
            <div key={k} className="flex items-center gap-1">
              <select value={f.by} onChange={(e) => changeKind(i, k, e.target.value as LabelFilterKind)} aria-label={t('labelPreset.condition')} className={field}>
                {LABEL_FILTER_KINDS.map((by) => <option key={by} value={by}>{t(KIND_LABEL[by])}</option>)}
              </select>
              {f.by === 'property' ? (
                <>
                  <input type="text" value={f.set} onChange={(e) => setFilter(i, k, { ...f, set: e.target.value })} aria-label={t('labelPreset.set')} placeholder={t('labelPreset.set')} className={`${field} w-20`} />
                  <input type="text" value={f.name} onChange={(e) => setFilter(i, k, { ...f, name: e.target.value })} aria-label={t('labelPreset.property')} placeholder={t('labelPreset.property')} className={`${field} w-20`} />
                </>
              ) : null}
              <input type="text" value={f.value} onChange={(e) => setFilter(i, k, { ...f, value: e.target.value })} aria-label={t('labelPreset.value')} placeholder={t('labelPreset.value')} className={`${field} w-20 flex-1`} />
              <button type="button" aria-label={t('labelPreset.removeCondition')} disabled={g.filters.length < 2} onClick={() => setGroup(i, { ...g, filters: g.filters.filter((_, j) => j !== k) })} className="rounded p-1 text-sky-200 hover:bg-sky-400/20 disabled:opacity-30"><X className="size-3" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className={WALL_PILL} onClick={() => setGroup(i, { ...g, filters: [...g.filters, { by: 'class', value: '' }] })}>{t('labelPreset.addCondition')}</button>
            {groups.length > 1 ? <button type="button" className={WALL_PILL} onClick={() => setGroups(groups.filter((_, j) => j !== i))}>{t('labelPreset.removeGroup')}</button> : null}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button type="button" className={WALL_PILL} onClick={() => setGroups([...groups, blank()])}>{t('labelPreset.addGroup')}</button>
        <button type="button" className={WALL_PILL} disabled={!ready} onClick={save}>{t('labelPreset.save')}</button>
      </div>
    </section>
  );
}
