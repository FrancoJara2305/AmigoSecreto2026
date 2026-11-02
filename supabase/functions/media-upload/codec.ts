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
import { inspectImage, ImageValidationError, MEDIA_OUTPUT } from '../_shared/image-inspection.ts';
import { downscale } from '../_shared/image-downscale.ts';

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
      const limits = MEDIA_OUTPUT[purpose];
      const scale = Math.min(1,limits.side/Math.max(decoded.width,decoded.height));
      const width = Math.max(1,Math.round(decoded.width*scale)); const height = Math.max(1,Math.round(decoded.height*scale));
      // Original decoded buffer is never encoded as-is.
      const data = scale < 1 ? downscale(decoded, width, height) : decoded.data;
      decoded = null;
      const encoder: Encoder=await encoderFactory(await options('webp/codec/enc/webp_enc.wasm'));
      const output = encoder.encode(data,width,height,{ ...defaultOptions, quality: 82, method: 2, target_size: limits.target, low_memory: 1 });
      if (!output) throw new ImageValidationError();
      // Hard output ceiling; target_size is an encoder goal, not a safety guarantee.
      if (output.byteLength > limits.max) throw new ImageValidationError();
      inspectImage(output,'image/webp');
      return new Uint8Array(output);
    } finally { active = false; }
  };
}
