// Vendored jSquash low-level modules. See vendor/manifest.json and licenses.
// @ts-ignore Generated Emscripten JS has no standalone type declarations.
import jpegFactory from './vendor/jpeg/codec/dec/mozjpeg_dec.js';
// @ts-ignore Generated Emscripten JS.
import webpFactory from './vendor/webp/codec/dec/webp_dec.js';
// @ts-ignore Generated Emscripten JS.
import encoderFactory from './vendor/webp/codec/enc/webp_enc.js';
// @ts-ignore Generated wasm-bindgen JS.
import pngInit, { decode as pngDecode, releaseCodec } from './vendor/png/codec/pkg/squoosh_png.js';
// @ts-ignore Upstream option defaults.
import { defaultOptions } from './vendor/webp/meta.js';
import { inspectImage, ImageValidationError } from '../_shared/image-inspection.ts';

type Pixels = { data: Uint8ClampedArray; width: number; height: number };
type Decoder = { decode(bytes: Uint8Array, preserveOrientation?: boolean): Pixels | null };
type Encoder = { encode(data: Uint8ClampedArray, w: number, h: number, options: unknown): Uint8Array | null };
// Deno has no Canvas/ImageData. Only the decoded pixel container is needed by these codecs.
if (!globalThis.ImageData) Object.defineProperty(globalThis, 'ImageData', { value: class {
  data: Uint8ClampedArray; width: number; height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) { this.data=data; this.width=width; this.height=height; }
} });

export function createImageNormalizer(read: (url: URL) => Promise<Uint8Array>) {
  const binary = (path: string) => read(new URL(`./vendor/${path}`, import.meta.url));
  // One decode per isolate; no overlapping WASM heaps / request memory spikes.
  let active = false;
  return async (bytes: Uint8Array, mime: string, purpose: 'gift' | 'avatar'): Promise<Uint8Array> => {
    if (active) throw new Error('IMAGE_BUSY');
    active = true;
    try {
      const header = inspectImage(bytes, mime);
      let decoded: Pixels | null;
      const options = async (path: string) => ({ wasmBinary: await binary(path), print: () => {}, printErr: () => {} });
      if (mime === 'image/jpeg') {
        const jpeg: Decoder=await jpegFactory(await options('jpeg/codec/dec/mozjpeg_dec.wasm'));
        try { decoded=jpeg.decode(bytes,true); } catch { throw new ImageValidationError(); }
      } else if (mime === 'image/webp') {
        const webp: Decoder=await webpFactory(await options('webp/codec/dec/webp_dec.wasm'));
        try { decoded=webp.decode(bytes); } catch { throw new ImageValidationError(); }
      } else {
        await pngInit(await binary('png/codec/pkg/squoosh_png_bg.wasm'));
        try { decoded=pngDecode(bytes); } catch { throw new ImageValidationError(); }
        finally { releaseCodec(); }
      }
      if (!decoded || !((decoded.width===header.width && decoded.height===header.height) ||
        (mime==='image/jpeg' && decoded.width===header.height && decoded.height===header.width)) || decoded.data.length !== header.width * header.height * 4) throw new ImageValidationError();
      const longest = purpose === 'gift' ? 1200 : 512;
      const scale = Math.min(1,longest/Math.max(decoded.width,decoded.height));
      const width = Math.max(1,Math.round(decoded.width*scale)); const height = Math.max(1,Math.round(decoded.height*scale));
      let data = decoded.data;
      if (scale < 1) {
        // Bilinear resize, bounded to <=1.44 MP. Original decoded buffer is never encoded as-is.
        data = new Uint8ClampedArray(width*height*4);
        for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
          const sx=(x+.5)*decoded.width/width-.5, sy=(y+.5)*decoded.height/height-.5;
          const x0=Math.max(0,Math.floor(sx)), y0=Math.max(0,Math.floor(sy));
          const x1=Math.min(decoded.width-1,x0+1), y1=Math.min(decoded.height-1,y0+1);
          const dx=Math.max(0,sx-x0), dy=Math.max(0,sy-y0);
          for (let c=0;c<4;c++) data[(y*width+x)*4+c] =
            decoded.data[(y0*decoded.width+x0)*4+c]*(1-dx)*(1-dy) + decoded.data[(y0*decoded.width+x1)*4+c]*dx*(1-dy) +
            decoded.data[(y1*decoded.width+x0)*4+c]*(1-dx)*dy + decoded.data[(y1*decoded.width+x1)*4+c]*dx*dy;
        }
      }
      decoded = null;
      const encoder: Encoder=await encoderFactory(await options('webp/codec/enc/webp_enc.wasm'));
      const output = encoder.encode(data,width,height,{ ...defaultOptions, quality: 76, method: 2, target_size: purpose === 'gift' ? 250_000 : 100_000, low_memory: 1 });
      if (!output) throw new ImageValidationError();
      // Hard output ceiling; target_size is an encoder goal, not a safety guarantee.
      if (output.byteLength > (purpose === 'gift' ? 400_000 : 150_000)) throw new ImageValidationError();
      inspectImage(output,'image/webp');
      return new Uint8Array(output);
    } finally { active = false; }
  };
}
