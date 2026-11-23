/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's number: its `Name`, when a `LongName` that says something else names the room. A `LongName` that only repeats
 * the `Name` (what several exporters write for a room nobody numbered) leaves the room without a number, so a tag or a
 * schedule row does not print the same words twice. The tag's `{RoomNumber}` takes it from here in the app and in the
 * engine, so the two cannot differ.
 */
export function roomNumberOf(name: string | null | undefined, longName: string | null | undefined): string {
  const long = (longName ?? '').trim();
  return long && long !== (name ?? '').trim() ? name ?? '' : '';
}
