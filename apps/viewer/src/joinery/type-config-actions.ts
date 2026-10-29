/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Configuring the opening of an IFC door or window TYPE (#448): leaves, how each opens, a fixed light above. The configuration is a catalogue
 * entry and a mapping of the type to it (`configureTypeOpening`, the engine's), written to the project only, so every element of the type
 * is drawn with it, in the schedule's elevation and in the plan, and the model is not changed.
 */

import { DEFAULT_JOINERY_MAPPING } from '@bimvoice/ifcsheet';
import { configureTypeOpening, openingOfSpec, typeEntryId, type TypeOpening } from '@bimvoice/ifcsheet/project';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { useProjectStore } from '@/project/project-store';
import type { ElementFacts } from './symbol-mapping';

/** The opening configured for the element's IFC type, or null when the type has none (or the element has no type). */
export function typeOpeningOf(facts: Pick<ElementFacts, 'typeGlobalId'>): TypeOpening | null {
  if (!facts.typeGlobalId) return null;
  const id = typeEntryId(facts.typeGlobalId);
  const entry = (useProjectStore.getState().joineryTypes ?? []).find((e) => e.id === id);
  return entry ? openingOfSpec(entry) : null;
}

/** Configure the element's IFC type. Returns the entry's id, or null for an element whose type is not known (nothing to configure). */
export function configureElementType(facts: ElementFacts, opening: TypeOpening): string | null {
  if (!facts.typeGlobalId) return null;
  const s = useProjectStore.getState();
  const fallback = facts.kind === 'door' ? defaultDoorSpec() : defaultWindowSpec();
  const out = configureTypeOpening(
    { joineryTypes: s.joineryTypes ?? [], joineryMapping: s.joineryMapping ?? DEFAULT_JOINERY_MAPPING },
    {
      typeGlobalId: facts.typeGlobalId, kind: facts.kind, name: facts.names[0] ?? '', opening,
      // The overall size is the IFC's; an element that gives none keeps the kind's default size.
      size: { width: facts.width ?? fallback.width, height: facts.height ?? fallback.height },
    },
  );
  useProjectStore.setState({ joineryTypes: out.joineryTypes, joineryMapping: out.joineryMapping, dirty: true });
  return out.entryId;
}
