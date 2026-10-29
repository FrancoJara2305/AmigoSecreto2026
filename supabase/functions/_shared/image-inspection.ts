// Header/container checks happen BEFORE any codec allocation. Full decoding is still mandatory.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
export type ImageInfo = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number };
export class ImageValidationError extends Error { constructor() { super('INVALID_IMAGE'); } }
const invalid = (): never => { throw new ImageValidationError(); };
const ascii = (b: Uint8Array, p: number, n: number) => String.fromCharCode(...b.subarray(p, p + n));
function dimensions(mime: ImageInfo['mime'], width: number, height: number): ImageInfo {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS || (mime==='image/webp' && (width>16383 || height>16383))) invalid();
  return { mime, width, height };
}
export function inspectImage(b: Uint8Array, claimedMime?: string): ImageInfo {
  if (b.length < 12 || b.length > MAX_IMAGE_BYTES) invalid();
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let info: ImageInfo | undefined;
  if (ascii(b,0,8) === '\x89PNG\r\n\x1a\n') {
    if (b.length < 45 || v.getUint32(8) !== 13 || ascii(b,12,4) !== 'IHDR') invalid();
    info = dimensions('image/png', v.getUint32(16), v.getUint32(20));
    let p = 8; let data = false; let ended = false;
    while (p + 12 <= b.length) {
      const length = v.getUint32(p); const kind = ascii(b,p+4,4);
      if (p + length + 12 > b.length || ['acTL','fcTL','fdAT'].includes(kind)) invalid();
      if (kind === 'IDAT') data = true;
      p += length + 12;
      if (kind === 'IEND') { if (length !== 0 || p !== b.length) invalid(); ended = true; break; }
    }
    if (!data || !ended) invalid();
  } else if (ascii(b,0,4) === 'RIFF' && ascii(b,8,4) === 'WEBP') {
    if (v.getUint32(4,true) + 8 !== b.length) invalid();
    let p = 12; let image = false;
    while (p + 8 <= b.length) {
      const kind = ascii(b,p,4); const size = v.getUint32(p+4,true); const d = p + 8;
      if (d + size > b.length || ['ANIM','ANMF'].includes(kind)) invalid();
      if (kind === 'VP8X') {
        if (size !== 10 || (b[d] & 2)) invalid();
        const u24 = (i: number) => b[i] + b[i+1]*256 + b[i+2]*65536;
        info = dimensions('image/webp',1+u24(d+4),1+u24(d+7));
      } else if (kind === 'VP8 ') {
        if (size < 10 || ascii(b,d+3,3) !== '\x9d\x01\x2a' || image) invalid();
        const inner = dimensions('image/webp',v.getUint16(d+6,true)&16383,v.getUint16(d+8,true)&16383);
        if (info && (info.width !== inner.width || info.height !== inner.height)) invalid();
        info = inner; image = true;
      } else if (kind === 'VP8L') {
        if (size < 5 || b[d] !== 47 || image) invalid();
        const bits = v.getUint32(d+1,true);
        const inner = dimensions('image/webp',1+(bits&16383),1+((bits>>>14)&16383));
        if (info && (info.width !== inner.width || info.height !== inner.height)) invalid();
        info = inner; image = true;
      }
      p = d + size + (size&1);
    }
    if (p !== b.length || !image) invalid();
  } else if (b[0] === 255 && b[1] === 216) {
    // Parse all markers including entropy-coded scans, reject concatenation, missing EOI and MPO.
    let p = 2; let ended = false; let scan = false;
    while (p < b.length) {
      if (b[p++] !== 255) invalid();
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 217) { ended = p === b.length; break; }
      if (marker === 0 || marker === 216 || (marker >= 208 && marker <= 215) || p+2>b.length) invalid();
      const size = v.getUint16(p);
      if (size < 2 || p+size > b.length) invalid();
      if (marker === 226 && ascii(b,p+2,4) === 'MPF\0') invalid();
      if ([192,193,194].includes(marker)) {
        if (size < 8 || info) invalid();
        info = dimensions('image/jpeg',v.getUint16(p+5),v.getUint16(p+3));
      } else if (marker >= 195 && marker <= 207 && ![196,200,204].includes(marker)) invalid();
      p += size;
      if (marker === 218) {
        scan = true;
        while (p < b.length) {
          if (b[p] !== 255) { p++; continue; }
          let q = p+1; while (b[q] === 255) q++;
          if (b[q] === 0 || (b[q] >= 208 && b[q] <= 215)) { p=q+1; continue; }
          break;
        }
      }
    }
    if (!ended || !scan) invalid();
  }
  if (!info || (claimedMime && claimedMime !== info.mime)) invalid();
  return info!;
}
