/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block of Romanian practice (cartuș, #54, #364), as a layout in the
 * block's 180 x 50 mm (`TITLE_BLOCK_MM`), so it sits in the frame at every
 * paper size and in both positions like the standard one. It carries the data
 * of the informative model F_01 (Ordinul MDLPA 975/2026, Anexa 4): firm with
 * registration number, titles, numbers, date, scale, phase, beneficiary, the
 * authors and the project manager with professional title and signature box,
 * and the verifier / expert with capacity, requirement, report and signature.
 *
 * Captions are in the language of `t` at the time the layout is chosen, as the
 * standard layout's are. The words are the ones `../i18n/ro-glossary.md` keeps.
 * The layout is then the project's own (`ProjectDocument.titleBlockTemplate`)
 * and editable like any other (#143).
 *
 * The layout is built in the engine package (`packages/ifcsheet/src/title-block-ro.ts`), so `ifcsheet build --standard ro`
 * prints the same one; this module re-exports it.
 */

export { RO_COLUMNS, RO_ROWS, romanianTitleBlock } from '@bimvoice/ifcsheet';
