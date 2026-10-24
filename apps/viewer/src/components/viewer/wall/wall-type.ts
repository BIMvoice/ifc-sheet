/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's type ramp and spacing, written once. The Wall's navy surfaces
 * (header, drawer, cards, forms) each used to carry their own copy of these
 * classes, and the copies drifted: a pill was 12px in one card and 14px in
 * the next, an input 14px or 16px, a card title 30px above a 14px sheet
 * title. Every size here is a step of the viewer's type scale
 * (`--text-2xs` .. `text-*` in `index.css`); none is below its smallest.
 *
 *   eyebrow    text-2xs  11px  small caps label above a block
 *   pill, field, card body, labels  text-xs / text-sm  12-14px
 *   card title text-xl   20px  never larger than the sheet's own title block
 */

/** A rounded text button (header, toolbars, cards). Never wraps; a long label is the container's to wrap around. */
export const WALL_PILL = 'whitespace-nowrap rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70';

/** A text input or select inside a card. */
export const WALL_FIELD = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1 text-sm text-white';

/** The label above a field. */
export const WALL_LABEL = 'block text-xs text-sky-200';

/**
 * The bound every card at the side of a sheet shares: the card shrinks to the room its host
 * (`WALL_CARD_HOST`) leaves and scrolls inside itself, so a tall card never pushes the page
 * or the sheet. `min-h-0` lets a flex child go below its content height.
 */
export const WALL_CARD_BOUND = 'min-h-0 overflow-y-auto overscroll-contain';

/** Where a card sits over the sheet: top right, no taller than the sheet area less its margins. */
export const WALL_CARD_HOST = 'pointer-events-none absolute right-3 top-3 flex max-h-[calc(100%-1.5rem)] flex-col [&>*]:pointer-events-auto';

/** The surface of a card at the right of a sheet. */
export const WALL_CARD = `${WALL_CARD_BOUND} w-[340px] rounded-xl border border-sky-300/20 bg-[#0b2348]/95 p-5 text-sm leading-normal text-sky-100 shadow-2xl backdrop-blur`;

/** A small-caps label: a card's eyebrow, a drawer section. */
export const WALL_EYEBROW = 'm-0 text-2xs font-medium uppercase tracking-widest text-cyan-400';

/** A card's title under its eyebrow. */
export const WALL_CARD_TITLE = 'mb-3 mt-1.5 text-xl font-light leading-snug text-white';
