/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block of Romanian practice (cartuș, #54), as a layout in the
 * block's 180 x 50 mm (`TITLE_BLOCK_MM`), so it sits in the frame at every
 * paper size and in both positions like the standard one:
 *
 *   - left: proiectant general (with the logo), project, sheet title, site
 *     address, client (beneficiar);
 *   - middle: șef proiect, proiectat, desenat, verificat, then date and revision;
 *   - right: phase and project number, sheet number and scale, and two empty
 *     boxes for the stamps and signatures of the designer and of the verifier.
 *
 * Captions are in the language of `t` at the time the layout is chosen, as the
 * standard layout's are. The words are the ones `../i18n/ro-glossary.md` keeps.
 * The layout is then the project's own (`ProjectDocument.titleBlockTemplate`)
 * and editable like any other (#143).
 *
 * The layout is built in the engine package (`packages/ifcsheet/src/title-block-ro.ts`), so `ifcsheet build --standard ro`
 * prints the same one; this module re-exports it.
 */

export { RO_COLUMNS, RO_STAMP_TOP, romanianTitleBlock } from '@bimvoice/ifcsheet';
