/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** One template (a triangle) and one instance of `entityId`, as IFNS bytes (packed-instanced-decoder.ts's layout). */
export function shardBytes(entityId: number): ArrayBuffer {
  const posLen = 9, nrmLen = 9, idxLen = 3;
  const templateTableOff = 32, instanceTableOff = templateTableOff + 48, posOff = instanceTableOff + 88;
  const nrmOff = posOff + posLen * 4, idxOff = nrmOff + nrmLen * 4;
  const buf = new ArrayBuffer(idxOff + idxLen * 4);
  const dv = new DataView(buf);
  [0x4946_4e53, 1, 1, 1, posLen, nrmLen, idxLen, 0].forEach((v, i) => dv.setUint32(i * 4, v, true));
  [0, posLen, 0, nrmLen, 0, idxLen].forEach((v, i) => dv.setUint32(templateTableOff + i * 4, v, true));
  dv.setUint32(instanceTableOff, 0, true);
  dv.setUint32(instanceTableOff + 4, entityId, true);
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) => dv.setFloat32(instanceTableOff + 8 + i * 4, v, true));
  new Float32Array(buf, posOff, posLen).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Float32Array(buf, nrmOff, nrmLen).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  new Uint32Array(buf, idxOff, idxLen).set([0, 1, 2]);
  return buf;
}
