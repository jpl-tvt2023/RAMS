// A .zip with its files stored as they are (no compression) -- what an .xlsx
// is underneath (utils/xlsx.js). Small, so RAMS needs no zip library.
// files: [{ name, data: Uint8Array | string }] -> Uint8Array.

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);

export function zipStore(files) {
  const entries = files.map((f) => {
    const name = utf8(f.name);
    const data = typeof f.data === 'string' ? utf8(f.data) : f.data;
    return { name, data, crc: crc32(data) };
  });
  const DOS_DATE = (1 << 5) | 1; // 1 Jan 1980: the file dates don't matter here
  const local = (e) => {
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true); // version needed
    h.setUint16(6, 0x0800, true); // names are UTF-8
    h.setUint16(8, 0, true); // stored
    h.setUint16(10, 0, true);
    h.setUint16(12, DOS_DATE, true);
    h.setUint32(14, e.crc, true);
    h.setUint32(18, e.data.length, true);
    h.setUint32(22, e.data.length, true);
    h.setUint16(26, e.name.length, true);
    h.setUint16(28, 0, true);
    return new Uint8Array(h.buffer);
  };
  const central = (e, offset) => {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true);
    h.setUint16(4, 20, true); // made by
    h.setUint16(6, 20, true); // needed
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, 0, true);
    h.setUint16(14, DOS_DATE, true);
    h.setUint32(16, e.crc, true);
    h.setUint32(20, e.data.length, true);
    h.setUint32(24, e.data.length, true);
    h.setUint16(28, e.name.length, true);
    // extra, comment, disk, internal and external attributes: 0
    h.setUint32(42, offset, true);
    return new Uint8Array(h.buffer);
  };

  const parts = [];
  const dir = [];
  let offset = 0;
  for (const e of entries) {
    const head = local(e);
    dir.push({ e, offset });
    parts.push(head, e.name, e.data);
    offset += head.length + e.name.length + e.data.length;
  }
  const dirStart = offset;
  for (const { e, offset: at } of dir) {
    const head = central(e, at);
    parts.push(head, e.name);
    offset += head.length + e.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - dirStart, true);
  end.setUint32(16, dirStart, true);
  parts.push(new Uint8Array(end.buffer));

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export { crc32 };
