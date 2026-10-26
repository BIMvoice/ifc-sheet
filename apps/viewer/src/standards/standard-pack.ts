/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A standards pack (#365): an office's drawing standard as ONE installable library item. The definitions (the parts a
 * pack can set, `romaniaPack`, the built-in packs) are the engine package's (`packages/ifcsheet/src/standard-pack.ts`),
 * re-exported here, so `ifcsheet build --standard ro` applies the same pack "Install standard" does. The pack as a
 * `.bvlib` file is `standard-pack-file.ts`.
 */

export {
  PACK_NOT_SET, PACK_PARTS, ROMANIA_PACK_ID, STANDARD_PACK_VERSION, builtInPacks, packPartsOf as partsOf, romaniaPack,
  type PackNotSet, type PackPart, type StandardPack,
} from '@bimvoice/ifcsheet';
