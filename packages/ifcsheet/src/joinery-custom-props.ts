/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Properties typed in by hand for a door or window type (#448): thermal transmittance, a fire rating, anything the IFC lacks. They live
 * in the type's catalogue entry (`JoinerySpec.custom`), so they are saved with the project and read by the headless engine, and are never
 * written to the IFC. The joinery schedule shows them as rows, like model properties.
 *
 * Two names are suggested (`key`): the schedule's own U value and fire rating rows read those, so they are not shown twice. Every other
 * name is a row of its own, `prop:<name>`. Pure, shared by the web app and the headless engine.
 */

import type { JoineryCustomProp, JoinerySpec } from '@ifc-lite/create';

export const MAX_CUSTOM_PROPS = 20;
export const CUSTOM_KEYS = ['thermalTransmittance', 'fireRating'] as const;

/** The id of the row of the property `name` among a schedule's rows. */
export const propRowId = (name: string): string => `prop:${name}`;

/** `props` made valid: names trimmed and unique (case aside), empty names and values dropped, at most `MAX_CUSTOM_PROPS`. A name that is not a suggestion carries no key. */
export function cleanCustomProps(props: readonly JoineryCustomProp[] | undefined): JoineryCustomProp[] {
  const seen = new Set<string>();
  const out: JoineryCustomProp[] = [];
  for (const p of props ?? []) {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    const value = typeof p?.value === 'string' ? p.value.trim() : '';
    if (!name || !value || seen.has(name.toLowerCase())) continue;
    const key = CUSTOM_KEYS.find((k) => k === p.key);
    // A suggestion fills its row only once: a second pair with the same key would be hidden.
    if (key && out.some((o) => o.key === key)) continue;
    seen.add(name.toLowerCase());
    out.push(key ? { name, value, key } : { name, value });
    if (out.length >= MAX_CUSTOM_PROPS) break;
  }
  return out;
}

/** The custom properties as saved in a project file, read back tolerantly. */
export const readCustomProps = (raw: unknown): JoineryCustomProp[] =>
  cleanCustomProps(Array.isArray(raw) ? raw.filter((p): p is JoineryCustomProp => typeof p === 'object' && p !== null) : []);

/** The names of the properties the schedule gets a row for: those of `specs` without a suggested key, in the order first met. */
export function customPropNames(specs: readonly (Pick<JoinerySpec, 'custom'> | null | undefined)[]): string[] {
  const names: string[] = [];
  for (const s of specs) for (const p of s?.custom ?? []) if (!p.key && !names.includes(p.name)) names.push(p.name);
  return names;
}

/** The value of the property `name` of the type, or undefined. */
export const customValue = (spec: Pick<JoinerySpec, 'custom'> | null | undefined, name: string): string | undefined =>
  spec?.custom?.find((p) => !p.key && p.name === name)?.value;

/** The thermal transmittance of the type, W/(m²K): the entry's own, else the hand-typed one. */
export function thermalOf(spec: Pick<JoinerySpec, 'props' | 'custom'> | null | undefined): number | undefined {
  if (spec?.props.thermalTransmittance !== undefined) return spec.props.thermalTransmittance;
  const typed = spec?.custom?.find((p) => p.key === 'thermalTransmittance')?.value;
  const n = typed === undefined ? NaN : Number(typed.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** The fire rating of the type: the entry's own, else the hand-typed one. */
export const fireOf = (spec: Pick<JoinerySpec, 'props' | 'custom'> | null | undefined): string | undefined =>
  spec?.props.fireRating ?? spec?.custom?.find((p) => p.key === 'fireRating')?.value;
