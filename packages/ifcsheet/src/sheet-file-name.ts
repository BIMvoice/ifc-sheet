/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The name of a sheet's DXF file, shared by `ifcsheet build --dxf` and the MCP `ifcsheet_export_dxf`, so both write the same files. */

/** A file name made of the sheet number (A-101), safe on every file system. */
export const dxfName = (number: string, used: Set<string>): string => {
  const base = number.replace(/[^A-Za-z0-9._-]+/g, '_') || 'sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}`;
  used.add(name.toLowerCase());
  return `${name}.dxf`;
};
