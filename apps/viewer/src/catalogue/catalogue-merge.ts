/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Merging an incoming catalogue into a project's. Definitions are the same
 * definition when their names agree (case and spacing aside); on such a
 * clash the policy decides:
 *
 * - `mine`: keep the project's, drop the incoming one;
 * - `theirs`: the incoming definition replaces the project's, keeping the
 *   project's id so everything that uses it follows;
 * - `both`: keep both; the incoming one is renamed "Name (2)".
 *
 * A clash between definitions that say the same thing (the Standard styles
 * and layer 0 every project has, say) is no clash: the project's stays.
 *
 * Everything that is not a clash is added. References between definitions
 * (a dimension style's text style, a layer's group, an annotation type's
 * styles and layer, a legend's text style, a material's hatch) are carried
 * to whichever definition the policy left standing.
 */

import { parsePat, serializePat, type HatchPattern } from '@/drafting/hatch/pattern';
import { STANDARD } from '@/drafting/styles';
import { freshProjectId } from '@/project/view-defaults';
import { TAG_FIELD_IDS, TAG_KINDS, withSources, type TagFieldConfig } from '@/tagfields/tag-fields';
import type { Catalogue, CatalogueKind } from './catalogue-file';
import { mergeCadLayers } from './cad-layers-merge';

export type ClashPolicy = 'mine' | 'theirs' | 'both';

export interface KindReport {
  added: number;
  /** Clashes where the project's definition stayed. */
  kept: number;
  /** Clashes where the incoming definition replaced the project's. */
  replaced: number;
  /** Clashes where the incoming one was added under a new name. */
  renamed: number;
}

/** Which definition stands for each incoming one, by incoming id (layers, symbols) or upper-cased name (hatch patterns renamed). */
export interface MergeMaps {
  layers: Map<string, string>;
  symbols: Map<string, string>;
  patterns: Map<string, string>;
}

export type MergeReport = Record<CatalogueKind, KindReport>;

const noReport = (): KindReport => ({ added: 0, kept: 0, replaced: 0, renamed: 0 });

export const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

/** Two definitions that differ only in their id (and a legend's creation time) are the same definition. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === 'id' || key === 'createdAt') return undefined;
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v;
  });
}

interface Merged<T> {
  list: T[];
  /** Incoming id → the id of the definition standing for it. */
  ids: Map<string, string>;
  report: KindReport;
}

function mergeNamed<T extends { id: string; name: string }>(
  mine: readonly T[], theirs: readonly T[], policy: ClashPolicy, prefix: string, fresh: (prefix: string) => string, remap: (t: T) => T = (t) => t,
): Merged<T> {
  const list = [...mine];
  const ids = new Map<string, string>();
  const report = noReport();
  for (const raw of theirs) {
    const t = remap(raw);
    const at = list.findIndex((m) => nameKey(m.name) === nameKey(t.name));
    if (at < 0) {
      const id = list.some((m) => m.id === t.id) ? fresh(prefix) : t.id;
      list.push({ ...t, id });
      ids.set(raw.id, id);
      report.added++;
    } else if (policy === 'mine' || canonical(list[at]) === canonical(t)) {
      // Nothing to choose between when they say the same thing: the project's stays, whatever the policy.
      ids.set(raw.id, list[at].id);
      report.kept++;
    } else if (policy === 'theirs') {
      list[at] = { ...t, id: list[at].id };
      ids.set(raw.id, list[at].id);
      report.replaced++;
    } else {
      const id = fresh(prefix);
      list.push({ ...t, id, name: uniqueName(t.name, new Set(list.map((m) => nameKey(m.name)))) });
      ids.set(raw.id, id);
      report.renamed++;
    }
  }
  return { list, ids, report };
}

/** Hatch patterns by name (case-insensitive), the same policies; returns which incoming name stands for which. */
function mergePatterns(mine: string, theirs: string, policy: ClashPolicy): { text: string; names: Map<string, string>; report: KindReport } {
  const list = parsePat(mine).patterns;
  const names = new Map<string, string>();
  const report = noReport();
  for (const t of parsePat(theirs).patterns) {
    const key = t.name.toUpperCase();
    const at = list.findIndex((m) => m.name.toUpperCase() === key);
    if (at < 0) {
      list.push(t);
      report.added++;
    } else if (policy === 'mine') {
      report.kept++;
    } else if (policy === 'theirs') {
      list[at] = t;
      report.replaced++;
    } else {
      const taken = new Set(list.map((m) => m.name.toUpperCase()));
      let name = `${t.name}-2`;
      for (let n = 3; taken.has(name.toUpperCase()); n++) name = `${t.name}-${n}`;
      const renamed: HatchPattern = { ...t, name };
      list.push(renamed);
      names.set(key, name);
      report.renamed++;
    }
  }
  return { text: list.length ? serializePat(list) : mine, names, report };
}

/**
 * The tag-field sources are one configuration, not a list of named definitions: each field of each tag kind is
 * a definition of its own. One the project has not set is added; one set the same stays; one set differently
 * follows the policy (`both` has no second place to put it, so the project's stays and it counts as kept).
 */
function mergeTagFields(mine: TagFieldConfig | undefined, theirs: TagFieldConfig | undefined, policy: ClashPolicy): { config: TagFieldConfig | undefined; report: KindReport } {
  const report = noReport();
  let config = mine;
  for (const kind of TAG_KINDS) {
    for (const field of TAG_FIELD_IDS) {
      const incoming = theirs?.[kind]?.[field];
      if (!incoming) continue;
      const have = config?.[kind]?.[field];
      if (!have) { config = withSources(config, kind, field, incoming); report.added++; }
      else if (canonical(have) === canonical(incoming) || policy !== 'theirs') report.kept++;
      else { config = withSources(config, kind, field, incoming); report.replaced++; }
    }
  }
  return { config, report };
}

/** The incoming catalogue merged into `mine`. Neither argument is changed. */
export function mergeCatalogues(
  mine: Catalogue, incoming: Catalogue, policy: ClashPolicy, fresh: (prefix: string) => string = freshProjectId,
): { catalogue: Catalogue; report: MergeReport; maps: MergeMaps } {
  const groups = mergeNamed(mine.layerGroups, incoming.layerGroups, policy, 'group', fresh);
  const layers = mergeNamed(mine.layers, incoming.layers, policy, 'layer', fresh, (l) => {
    if (!l.group) return l;
    const group = groups.ids.get(l.group);
    const { group: _dropped, ...rest } = l;
    return group ? { ...rest, group } : rest;
  });
  const texts = mergeNamed(mine.textStyles, incoming.textStyles, policy, 'text', fresh);
  const textId = (id: string) => texts.ids.get(id) ?? (mine.textStyles.some((s) => s.id === id) ? id : STANDARD);
  const dims = mergeNamed(mine.dimStyles, incoming.dimStyles, policy, 'dim', fresh, (d) => ({ ...d, textStyle: textId(d.textStyle) }));
  const patterns = mergePatterns(mine.hatchPatterns, incoming.hatchPatterns, policy);
  const pattern = (name: string) => patterns.names.get(name.toUpperCase()) ?? name;
  const materials = mergeNamed(mine.materials, incoming.materials, policy, 'material', fresh, (m) => (m.hatch ? { ...m, hatch: pattern(m.hatch) } : m));
  const dimId = (id: string) => dims.ids.get(id) ?? (mine.dimStyles.some((s) => s.id === id) ? id : STANDARD);
  const layerId = (id: string) => layers.ids.get(id) ?? (mine.layers.some((l) => l.id === id) ? id : '0');
  const types = mergeNamed(mine.annotationTypes, incoming.annotationTypes, policy, 'atype', fresh, (a) => ({
    ...a,
    ...(a.textStyle ? { textStyle: textId(a.textStyle) } : {}),
    ...(a.dimStyle ? { dimStyle: dimId(a.dimStyle) } : {}),
    ...(a.layer ? { layer: layerId(a.layer) } : {}),
    ...(a.hatch ? { hatch: { ...a.hatch, pattern: pattern(a.hatch.pattern) } } : {}),
  }));
  const symbols = mergeNamed(mine.symbols, incoming.symbols, policy, 'symbol', fresh);
  const legends = mergeNamed(mine.legends, incoming.legends.map(({ scopeId: _scopeId, ...rest }) => rest), policy, 'legend', fresh, (l) => ({ ...l, textStyle: textId(l.textStyle) }));
  const cad = mergeCadLayers(mine.cadLayers, incoming.cadLayers, policy, fresh);
  const tagFields = mergeTagFields(mine.tagFields, incoming.tagFields, policy);
  const details = mergeNamed(mine.details, incoming.details, policy, 'detail', fresh);
  const templates = mergeNamed(mine.sheetTemplates, incoming.sheetTemplates, policy, 'template', fresh);
  return {
    maps: { layers: layers.ids, symbols: symbols.ids, patterns: patterns.names },
    catalogue: {
      ...(tagFields.config ? { tagFields: tagFields.config } : {}),
      layers: layers.list, layerGroups: groups.list, textStyles: texts.list, dimStyles: dims.list, hatchPatterns: patterns.text,
      materials: materials.list, annotationTypes: types.list, symbols: symbols.list, legends: legends.list, cadLayers: cad.list, details: details.list, sheetTemplates: templates.list,
    },
    report: {
      layers: layers.report, textStyles: texts.report, dimStyles: dims.report, hatchPatterns: patterns.report,
      materials: materials.report, annotationTypes: types.report, symbols: symbols.report, legends: legends.report, cadLayers: cad.report, tagFields: tagFields.report, details: details.report, sheetTemplates: templates.report,
    },
  };
}
