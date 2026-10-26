/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A parsed model as the title block reads it (`ModelFacts`): the attributes of
 * the project, site and building, their properties, the OwnerHistory, and the
 * actors assigned a role. The app's sheets and this package's PDF read through
 * this one reader (`title-block-sources.ts` resolves what it answers), so the
 * phase, the roles and the organisation cannot differ between screen and paper.
 *
 * The app reads Name, LongName, Description and the properties through its
 * label reader instead (an edit in the Properties panel shows on the sheets);
 * it hands those in as `overrides`. The rest (address, OwnerHistory, actors)
 * is read from the record, which carries references the label reader leaves out.
 */

import { EntityExtractor, extractAllEntityAttributes, getAttributeNamesForSchema, type IfcDataStore } from '@ifc-lite/parser';
import { propertySetsOf } from './joinery-schedule.js';
import { MODEL_ENTITIES, type ModelEntity, type ModelFacts, type OwnerPart } from './title-block-sources.js';

type Raw = string | number | boolean | null | undefined | Raw[];

/** What every question answers when no model is loaded. */
export const SILENT_FACTS: ModelFacts = { attribute: () => '', property: () => '', owner: () => '', actor: () => '' };

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

/** Each answer read once: a title block asks the same few questions for every sheet. */
function memoised(facts: ModelFacts): ModelFacts {
  const answers = new Map<string, string>();
  const once = (key: string, read: () => string): string => {
    const known = answers.get(key);
    if (known !== undefined) return known;
    const value = read();
    answers.set(key, value);
    return value;
  };
  return {
    attribute: (on, name) => once(`a\u0000${on}\u0000${name}`, () => facts.attribute(on, name)),
    property: (on, pset, property) => once(`p\u0000${on ?? ''}\u0000${pset}\u0000${property}`, () => facts.property(on, pset, property)),
    owner: (part) => once(`o\u0000${part}`, () => facts.owner(part)),
    actor: (role) => once(`r\u0000${role}`, () => facts.actor(role)),
  };
}

/** How a host reads some answers its own way; what it leaves out is read from the record. */
export interface FactOverrides {
  /** The attribute `name` of the entity `id` (`on`'s first record), or undefined to read it from the record. */
  attribute?(on: ModelEntity, name: string, id: number): string | undefined;
  /** A property of a set on `on`, or on the first of project, site and building that has it; replaces the record read. */
  property?(on: ModelEntity | undefined, pset: string, property: string): string;
}

/** The first of the project, site and building that has a value for the property, read from the model's property sets. */
function storeProperty(r: Records, on: ModelEntity | undefined, pset: string, property: string): string {
  for (const entity of on ? [on] : MODEL_ENTITIES) {
    const id = r.first(entity);
    if (id === null) continue;
    const found = propertySetsOf({ dataStore: r.store, view: null }, id).find((s) => s.name === pset)?.properties.find((p) => p.name === property);
    if (found && found.value !== undefined && found.value !== null && found.value !== '') return String(found.value);
  }
  return '';
}

/** The model as `ModelFacts`, each answer read once. */
export function readStoreFacts(store: IfcDataStore, overrides: FactOverrides = {}): ModelFacts {
  const r = new Records(store);
  const addressOf = (on: ModelEntity, name: string): string => r.address(refOf(r.attrs(r.first(on))[name]));
  return memoised({
    attribute: (on, name) => {
      const id = r.first(on);
      if (id === null) return '';
      const own = overrides.attribute?.(on, name, id);
      if (own !== undefined) return own;
      if (name === 'SiteAddress' || name === 'BuildingAddress') return addressOf(on, name);
      const value = extractAllEntityAttributes(store, id).find((a) => a.name === name)?.value;
      return value === undefined ? '' : String(value);
    },
    property: overrides.property ?? ((on, pset, property) => storeProperty(r, on, pset, property)),
    owner: (part) => owner(r, part),
    actor: (role) => actor(r, role),
  });
}
