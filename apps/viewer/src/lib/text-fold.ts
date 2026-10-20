/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Text folded for matching: lower case, accents and other combining marks
 * removed, so "sectiune" finds "Secțiune" and "Etaj 1" finds "etáj 1". Letters
 * that do not decompose (ø, ł, đ, ß, æ) are mapped by hand.
 *
 * This is the one normalisation; the sheet-search match of the Wall's search
 * box (`wall-find.ts` on the unmerged large-wall branch) is meant to call it
 * rather than carry its own, once both are on main.
 */

const LETTERS: Readonly<Record<string, string>> = { ø: 'o', ł: 'l', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i' };

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[øłđßæœı]/g, (c) => LETTERS[c]);
}
