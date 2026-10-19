/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded model as the title block reads it (`ModelFacts`), and what every
 * sheet prints for the project: typed values over the mapped ones. Names,
 * descriptions and properties are read the way the labels read them
 * (`labels/label-element.ts`), so an edit in the Properties panel shows on
 * the sheets; the rest (address, OwnerHistory, actors) is read from the
 * record, which carries references the label reader leaves out.
 */

import { useMemo } from 'react';
import { EntityExtractor, extractAllEntityAttributes, getAttributeNamesForSchema, type IfcDataStore } from '@ifc-lite/parser';
import { labelElementOf } from '@/labels/label-element';
import { readField } from '@/labels/label-resolve';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { TITLE_BLOCK_FIELDS } from './title-block';
import { effectiveFields, resolveTitleBlock, type ModelEntity, type ModelFacts, type OwnerPart, type ResolvedField, type TitleSources } from './title-block-sources';

type Raw = string | number | boolean | null | undefined | Raw[];
const SILENT: ModelFacts = { attribute: () => '', property: () => '', owner: () => '', actor: () => '' };

const text = (v: Raw): string => (typeof v === 'string' ? v.replace(/^\.(.*)\.$/, '$1') : '');
const refOf = (v: Raw): number | null => (typeof v === 'number' ? v : null);

/** Reads one model's records. */
class Records {
  private readonly extractor: EntityExtractor;
  constructor(readonly store: IfcDataStore) {
    this.extractor = new EntityExtractor(store.source);
  }

  /** The record's attributes by name, references as express ids. */
  attrs(id: number | null): Record<string, Raw> {
    const ref = id === null ? undefined : this.store.entityIndex.byId.get(id);
    const entity = ref ? this.extractor.extractEntity(ref) : null;
    if (!ref || !entity) return {};
    const names = getAttributeNamesForSchema(ref.type, this.store.schemaVersion);
    return Object.fromEntries(names.map((n, i) => [n, entity.attributes[i] as Raw]));
  }

  first(type: string): number | null {
    return this.store.entityIndex.byType.get(type.toUpperCase())?.[0] ?? null;
  }

  all(type: string): number[] {
    return this.store.entityIndex.byType.get(type.toUpperCase()) ?? [];
  }

  /** A person's name as written on a drawing: given name first. */
  person(id: number | null): string {
    const p = this.attrs(id);
    return [text(p.GivenName), text(p.FamilyName)].filter(Boolean).join(' ');
  }

  organisation(id: number | null): string {
    return text(this.attrs(id).Name);
  }

  /** The party an actor stands for, by its name: an organisation, a person, or a person's organisation. */
  party(id: number | null): string {
    const type = id === null ? '' : this.store.entityIndex.byId.get(id)?.type;
    if (type === 'IFCPERSON') return this.person(id);
    if (type === 'IFCPERSONANDORGANIZATION') return this.organisation(refOf(this.attrs(id).TheOrganization)) || this.person(refOf(this.attrs(id).ThePerson));
    return this.organisation(id);
  }

  /** IfcPostalAddress as one line: lines, box, postcode and town, region, country. */
  address(id: number | null): string {
    const a = this.attrs(id);
    const lines = Array.isArray(a.AddressLines) ? a.AddressLines.map(text) : [];
    const town = [text(a.PostalCode), text(a.Town)].filter(Boolean).join(' ');
    return [...lines, text(a.PostalBox), town, text(a.Region), text(a.Country)].filter(Boolean).join(', ');
  }
}

function owner(r: Records, part: OwnerPart): string {
  const holders = [r.first('IfcProject'), r.first('IfcSite'), r.first('IfcBuilding')];
  const history = r.attrs(holders.map((h) => refOf(r.attrs(h).OwnerHistory)).find((h) => h !== null) ?? null);
  if (part === 'organisation') return r.organisation(refOf(r.attrs(refOf(history.OwningUser)).TheOrganization));
  if (part === 'person') return r.person(refOf(r.attrs(refOf(history.OwningUser)).ThePerson));
  const app = r.attrs(refOf(history.OwningApplication));
  if (part === 'developer') return r.organisation(refOf(app.ApplicationDeveloper));
  return [text(app.ApplicationFullName), text(app.Version)].filter(Boolean).join(' ');
}

/** The party assigned to the project, site or building through IfcRelAssignsToActor with this role. */
function actor(r: Records, role: string): string {
  const targets = new Set([r.first('IfcProject'), r.first('IfcSite'), r.first('IfcBuilding')]);
  const wanted = role.toUpperCase();
  const rolesOf = (v: Raw): string[] => (Array.isArray(v) ? v : []).flatMap((id) => {
    const a = r.attrs(refOf(id));
    return [text(a.Role), text(a.UserDefinedRole)];
  });
  for (const id of r.all('IfcRelAssignsToActor')) {
    const rel = r.attrs(id);
    const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects.map(refOf) : [];
    if (!related.some((o) => targets.has(o))) continue;
    const acting = r.attrs(refOf(rel.RelatingActor));
    const party = refOf(acting.TheActor);
    const own = [text(r.attrs(refOf(rel.ActingRole)).Role), text(r.attrs(refOf(rel.ActingRole)).UserDefinedRole)];
    if (![...own, ...rolesOf(r.attrs(party).Roles)].some((x) => x.toUpperCase() === wanted)) continue;
    const name = r.party(party);
    if (name) return name;
  }
  return '';
}

/** The first loaded model that has a project. */
function projectStore(): { modelId: string; store: IfcDataStore } | null {
  for (const [modelId, model] of useViewerStore.getState().models) {
    const store = model.ifcDataStore;
    if (store?.source?.length && store.entityIndex?.byType.get('IFCPROJECT')?.length) return { modelId, store };
  }
  return null;
}

const LABEL_ATTRIBUTES = new Set(['Name', 'LongName', 'Description']);

/** The loaded model as `ModelFacts`; silent without one. */
export function modelFacts(): ModelFacts {
  const found = projectStore();
  if (!found) return SILENT;
  const { modelId, store } = found;
  const r = new Records(store);
  const idOf = (on: ModelEntity): number | null => r.first(on);
  const addressOf = (on: ModelEntity, name: string): string => r.address(refOf(r.attrs(idOf(on))[name]));
  return {
    attribute: (on, name) => {
      const id = idOf(on);
      if (id === null) return '';
      // Edits made in the Properties panel read through the label reader.
      if (LABEL_ATTRIBUTES.has(name)) return labelElementOf(modelId, id)?.attribute(name as 'Name') ?? '';
      if (name === 'SiteAddress' || name === 'BuildingAddress') return addressOf(on, name);
      const value = extractAllEntityAttributes(store, id).find((a) => a.name === name)?.value;
      return value === undefined ? '' : String(value);
    },
    property: (on, pset, property) => {
      for (const entity of on ? [on] : (['IfcProject', 'IfcSite', 'IfcBuilding'] as const)) {
        const id = idOf(entity);
        const el = id === null ? null : labelElementOf(modelId, id);
        const value = el ? readField({ kind: 'property', set: pset, name: property, from: 'any' }, el) : undefined;
        if (value !== undefined && value !== null && value !== '') return String(value);
      }
      return '';
    },
    owner: (part) => owner(r, part),
    actor: (role) => actor(r, role),
  };
}

/** The fields the title block resolves, from the model and the project's typed values and mapping. */
export function resolvedTitleBlock(typed: Record<string, string> | undefined, custom: TitleSources | undefined, facts: ModelFacts = modelFacts()): Record<string, ResolvedField> {
  return resolveTitleBlock(TITLE_BLOCK_FIELDS, typed, custom, facts);
}

/** What every sheet prints for the project (before a sheet's own fields): typed over mapped. */
export function effectiveTitleBlock(typed?: Record<string, string>, custom?: TitleSources): Record<string, string> {
  const s = useProjectStore.getState();
  const t = typed ?? s.titleBlock;
  return effectiveFields(resolvedTitleBlock(t, custom ?? s.titleBlockSources), t);
}

/** The same, re-read when the typed values, the mapping, the models or an edit change. */
export function useResolvedTitleBlock(): Record<string, ResolvedField> {
  const typed = useProjectStore((s) => s.titleBlock);
  const custom = useProjectStore((s) => s.titleBlockSources);
  const models = useViewerStore((s) => s.models);
  const edits = useViewerStore((s) => s.mutationVersion);
  return useMemo(() => resolvedTitleBlock(typed, custom), [typed, custom, models, edits]);
}

export function useEffectiveTitleBlock(): Record<string, string> {
  const typed = useProjectStore((s) => s.titleBlock);
  const resolved = useResolvedTitleBlock();
  return useMemo(() => effectiveFields(resolved, typed), [resolved, typed]);
}
