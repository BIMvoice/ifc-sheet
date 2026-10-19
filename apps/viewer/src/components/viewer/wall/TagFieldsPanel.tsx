/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which IFC property feeds each field of a tag, in the project drawer: per tag
 * kind and field an ordered list of sources (the first with a value wins), with
 * what each reads on a real element of that kind from the loaded model. The
 * model of it is `tagfields/`; this holds only what the person sees and
 * chooses. The panel keeps its keys (`data-owns-keys`), so typing a property
 * name or pressing Enter on a button does not reach a running drawing tool.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { labelElementByGlobalId } from '@/labels/label-element';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { previewElements } from '@/tagfields/preview-elements';
import { isCustom, SOURCE_ATTRIBUTES, sourceText, TAG_FIELD_IDS, TAG_KINDS, sourcesOf, type TagFieldId, type TagKind, type TagSource } from '@/tagfields/tag-fields';
import { moved, setFieldSources } from '@/tagfields/tag-fields-actions';
import { parseSourcePath, previewSources, sourceCandidates } from '@/tagfields/tag-preview';
import { libraryAction } from './library-style';

type AddKind = 'attribute' | 'pset' | 'quantity' | 'type-pset';
const ADD_KINDS: readonly AddKind[] = ['pset', 'quantity', 'type-pset', 'attribute'];
const KIND_KEY: Record<AddKind, TranslationKey> = {
  attribute: 'tagFields.src.attribute', pset: 'tagFields.src.pset', quantity: 'tagFields.src.quantity', 'type-pset': 'tagFields.src.typePset',
};
const field = 'rounded border border-sky-300/30 bg-[#061a36] px-1.5 py-1 text-xs text-white';
const icon = 'rounded p-1 text-sky-200 hover:bg-sky-400/20 disabled:opacity-30';

function AddSource({ onAdd, suggestions }: { onAdd: (s: TagSource) => void; suggestions: readonly TagSource[] }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AddKind>('pset');
  const [path, setPath] = useState('');
  const [attribute, setAttribute] = useState<(typeof SOURCE_ATTRIBUTES)[number]>('Tag');
  const parsed = kind === 'attribute' ? ({ kind: 'attribute', name: attribute } as const) : parseSourcePath(kind, path);
  const listId = `tag-sources-${kind}`;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <select aria-label={t('tagFields.add.kind')} className={field} value={kind} onChange={(e) => setKind(e.target.value as AddKind)}>
        {ADD_KINDS.map((k) => <option key={k} value={k}>{t(KIND_KEY[k], { path: '…' })}</option>)}
      </select>
      {kind === 'attribute' ? (
        <select aria-label={t('tagFields.add.attribute')} className={field} value={attribute} onChange={(e) => setAttribute(e.target.value as typeof attribute)}>
          {SOURCE_ATTRIBUTES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      ) : (
        <>
          <input
            aria-label={t('tagFields.add.path')} placeholder={t('tagFields.add.pathHint')} list={listId} value={path} className={`${field} min-w-0 flex-1`}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && parsed) { onAdd(parsed); setPath(''); } }}
          />
          <datalist id={listId}>
            {suggestions.filter((s) => s.kind === kind).map((s) => <option key={sourceText(s)} value={sourceText(s)}>{sourceText(s)}</option>)}
          </datalist>
        </>
      )}
      <button type="button" className={libraryAction} disabled={!parsed} onClick={() => { if (parsed) { onAdd(parsed); setPath(''); } }}>{t('tagFields.add.button')}</button>
    </div>
  );
}

function FieldEditor({ kind, id, guid }: { kind: TagKind; id: TagFieldId; guid: string | null }) {
  const { t } = useTranslation();
  const config = useProjectStore((s) => s.tagFields);
  // The element is read again when the model or the sources change.
  const version = useViewerStore((s) => s.mutationVersion);
  const sources = sourcesOf(config, kind, id);
  const el = useMemo(() => (guid ? labelElementByGlobalId(guid) : null), [guid, version]);  // eslint-disable-line react-hooks/exhaustive-deps
  const rows = el ? previewSources(el, sources) : null;
  const set = (next: readonly TagSource[]) => setFieldSources(kind, id, next);
  const reads = rows?.find((r) => r.used)?.text ?? '';
  // A mark with no value is shown as the name (TAGALL's mark label and the TAG tool both fall back to it).
  const name = el && id === 'mark' && reads === '' ? previewSources(el, sourcesOf(config, kind, 'name')).find((r) => r.used)?.text ?? '' : '';
  const line = reads !== '' ? t('tagFields.preview.reads', { value: reads }) : name !== '' ? t('tagFields.preview.fallback', { value: name }) : t('tagFields.preview.reads', { value: t('tagFields.source.empty') });
  return (
    <fieldset className="m-0 mt-3 border-0 p-0">
      <legend className="flex w-full items-center gap-2 p-0 text-xs font-medium text-sky-50">
        <span>{t(`tagFields.field.${id}` as TranslationKey)}</span>
        {isCustom(config, kind, id) ? <button type="button" className={`${libraryAction} ml-auto`} onClick={() => setFieldSources(kind, id, sourcesOf(undefined, kind, id))}>{t('tagFields.reset')}</button> : null}
      </legend>
      {sources.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-300">{t('tagFields.noSources')}</p> : null}
      <ol className="m-0 mt-1 list-none space-y-1 p-0">
        {sources.map((s, i) => {
          const row = rows?.[i];
          const name = sourceText(s);
          return (
            <li key={`${s.kind}:${name}`} className="flex items-center gap-1 rounded bg-sky-400/5 px-1.5 py-1 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sky-50">{t(KIND_KEY[s.kind], { path: name })}</span>
                {row ? <span className={`block truncate ${row.used ? 'text-cyan-300' : 'text-sky-300'}`}>{row.text === '' ? t('tagFields.source.empty') : row.text}</span> : null}
              </span>
              <button type="button" className={icon} aria-label={t('tagFields.source.up', { name })} disabled={i === 0} onClick={() => set(moved(sources, i, i - 1))}><ArrowUp className="size-3.5" /></button>
              <button type="button" className={icon} aria-label={t('tagFields.source.down', { name })} disabled={i === sources.length - 1} onClick={() => set(moved(sources, i, i + 1))}><ArrowDown className="size-3.5" /></button>
              <button type="button" className={icon} aria-label={t('tagFields.source.remove', { name })} onClick={() => set(sources.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
            </li>
          );
        })}
      </ol>
      <AddSource suggestions={el ? sourceCandidates(el) : []} onAdd={(s) => set([...sources, s])} />
      {el ? <p className="m-0 mt-1 text-xs text-sky-200" data-testid={`tag-preview-${kind}-${id}`}>{line}</p> : null}
    </fieldset>
  );
}

export function TagFieldsPanel() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TagKind>('door');
  const models = useViewerStore((s) => s.models);
  const elements = useMemo(() => previewElements(kind), [kind, models]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const guid = elements.find((e) => e.guid === picked[kind])?.guid ?? elements[0]?.guid ?? null;
  return (
    <details className="border-t border-sky-300/10 px-4 py-3" data-owns-keys>
      <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.25em] text-cyan-400">{t('tagFields.title')}</summary>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('tagFields.hint')}</p>
      <fieldset className="m-0 mt-2 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">{t('tagFields.kind')}</legend>
        {TAG_KINDS.map((k) => (
          <button key={k} type="button" className={libraryAction} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`tagFields.kind.${k}` as TranslationKey)}</button>
        ))}
      </fieldset>
      {elements.length > 0 ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-sky-200">
          <span>{t('tagFields.preview.on')}</span>
          <select className={`${field} min-w-0 flex-1`} value={guid ?? ''} onChange={(e) => setPicked({ ...picked, [kind]: e.target.value })}>
            {elements.map((e) => <option key={e.guid} value={e.guid}>{e.name}</option>)}
          </select>
        </label>
      ) : <p className="m-0 mt-2 text-xs text-sky-300">{t('tagFields.preview.none')}</p>}
      {TAG_FIELD_IDS.map((id) => <FieldEditor key={`${kind}:${id}`} kind={kind} id={id} guid={guid} />)}
    </details>
  );
}
