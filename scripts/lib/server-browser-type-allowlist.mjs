/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ALLOWLIST for scripts/check-server-browser-type-parity.mjs. Split out
 * purely to stay under the module-size budget (AGENTS.md: "Prefer splitting
 * to allowlisting") once #4205 added the schema-derived HIERARCHY_REL_TYPES
 * rows below — see the parent file's header for the overall approach
 * (`checkConcept`, `staleAllowlistEntries`) this is read together with.
 */

/**
 * The allowlist. Every key is `${concept}:${TYPE_NAME}`. Every value is
 * `{ status, note }`:
 *
 *   - `status: 'deliberate'` — a SETTLED trade-off with its own tracking
 *     issue (e.g. #3254). Nobody is going to "fix" this; the note says why
 *     not, and a future agent should read the linked issue before touching
 *     either side's behaviour here.
 *   - `status: 'pending'` — a KNOWN divergence with an open PR already
 *     addressing it, OR flagged to a maintainer with the resolution not yet
 *     decided (e.g. "drop it / add it to the other side / keep and
 *     allowlist" are all still on the table). This gate does not assume an
 *     outcome: it only records that the gap is known and not silent.
 *
 * The distinction matters because the two failure modes it guards against
 * are different: a `deliberate` entry that quietly starts being used as
 * cover for an unrelated new gap is caught by this gate still comparing the
 * type EXACTLY (an allowlist entry suppresses one named type on one named
 * side, never a whole concept); a `pending` entry that outlives its PR
 * closing keeps citing a merged issue number, which is the trigger to
 * re-check whether it can be deleted.
 *
 * An entry here does not fix or hide the divergence: the type genuinely IS
 * absent from one side today, and a reader of this file can go verify that.
 */
export const ALLOWLIST = {
  // The generated server table now covers every schema-derived concrete
  // relationship except IFCRELASSOCIATES. The bundled IFC2X3 registry marks
  // that base type concrete, but it has no RelatingX attribute and therefore
  // cannot produce a meaningful relationship edge.
  'relationships:IFCRELASSOCIATES': { status: 'deliberate', note: '#4205: schema exception — no RelatingX attribute exists to extract' },

  // #3254: IfcPhysicalComplexQuantity groups other quantities instead of
  // carrying a measure itself, so neither side resolves it to a Quantity —
  // this is a DELIBERATE, tracked trade-off, not an in-flight fix. The
  // server never names the type at all; the TS side names it only to skip
  // it explicitly (`quantity-collect.ts`'s COMPLEX_QUANTITY_TYPE). Do not
  // remove this entry to "fix" the gap — see #3254 before changing either
  // side's behaviour here.
  'quantities:IFCPHYSICALCOMPLEXQUANTITY': { status: 'deliberate', note: '#3254 (deliberate, tracked gap)' },
};
