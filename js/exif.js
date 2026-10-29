// Wyciąga małą miniaturkę, którą aparaty zapisują w nagłówku EXIF pliku JPG (IFD1).
// Wystarcza do tego początek pliku — nie trzeba pobierać całego zdjęcia.
export function exifThumbnail(bytes) {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(0) !== 0xffd8) return null;
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) return null;
      const marker = bytes[pos + 1];
      if (marker === 0xda || marker === 0xd9) return null; // dalej są już dane obrazu
      const length = view.getUint16(pos + 2);
      const isExif = marker === 0xe1 && String.fromCharCode(...bytes.subarray(pos + 4, pos + 8)) === 'Exif';
      if (isExif) return fromTiff(view, bytes, pos + 10, Math.min(bytes.length, pos + 2 + length));
      pos += 2 + length;
    }
  } catch {
    // ucięty albo nietypowy nagłówek
  }
  return null;
}

function fromTiff(view, bytes, tiff, end) {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (offset) => view.getUint16(tiff + offset, little);
  const u32 = (offset) => view.getUint32(tiff + offset, little);
  if (u16(2) !== 42) return null;

  const ifd0 = u32(4);
  const ifd1 = u32(ifd0 + 2 + u16(ifd0) * 12);
  if (!ifd1) return null;

  let offset = 0;
  let length = 0;
  for (let i = 0, count = u16(ifd1); i < count; i++) {
    const entry = ifd1 + 2 + i * 12;
    const tag = u16(entry);
    if (tag === 0x0201) offset = u32(entry + 8);
    if (tag === 0x0202) length = u32(entry + 8);
  }
  const start = tiff + offset;
  if (!offset || !length || start + length > end) return null;
  const thumb = bytes.subarray(start, start + length);
  return thumb[0] === 0xff && thumb[1] === 0xd8 ? thumb : null;
}
