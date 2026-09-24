export type ZipEntry = { name: string; size: number; dir: boolean };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/**
 * Lee el índice de un .zip (el directorio central) sin descomprimir nada, para
 * decirle al modelo qué trae el archivo. Si el zip viene roto devuelve null.
 */
export function listZip(data: Buffer, max = 300): { entries: ZipEntry[]; total: number } | null {
  const min = Math.max(0, data.length - 65_557);
  let eocd = -1;
  for (let i = data.length - 22; i >= min; i--) {
    if (data.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;
  const total = data.readUInt16LE(eocd + 10);
  let offset = data.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < total && entries.length < max; n++) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== CENTRAL) return entries.length ? { entries, total } : null;
    const size = data.readUInt32LE(offset + 24);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const name = data.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({ name, size, dir: name.endsWith("/") });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, total };
}

export function isZip(mediaType: string, name: string) {
  return /zip/.test(mediaType) || /\.zip$/i.test(name);
}
