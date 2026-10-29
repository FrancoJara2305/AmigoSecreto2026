import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Pinned npm sources + package-lock integrity. No runtime CDN or network imports.
const files = {
  jpeg: ['LICENSE','codec/LICENSE.codec.md','codec/dec/mozjpeg_dec.js','codec/dec/mozjpeg_dec.wasm'],
  png: ['LICENSE','codec/LICENSE.codec.md','codec/pkg/squoosh_png.js','codec/pkg/squoosh_png_bg.wasm'],
  webp: ['LICENSE','codec/LICENSE.codec.md','meta.js','codec/dec/webp_dec.js','codec/dec/webp_dec.wasm','codec/enc/webp_enc.js','codec/enc/webp_enc.wasm'],
};
const manifest = {};
for (const [name, paths] of Object.entries(files)) {
  const source = new URL(`../node_modules/@jsquash/${name}/`, import.meta.url);
  const target = new URL(`../supabase/functions/media-upload/vendor/${name}/`, import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', source)));
  manifest[name] = { version: pkg.version, files: {} };
  for (const path of paths) {
    const output = new URL(path, target);
    await mkdir(new URL('./', output), { recursive: true });
    await cp(new URL(path, source), output);
    if (name==='png' && path==='codec/pkg/squoosh_png.js') {
      // Release the singleton wasm-bindgen heap between uploads. All changes are reproducible here.
      await writeFile(output,(await readFile(output,'utf8'))+'\nexport function releaseCodec() { wasm = undefined; cachedUint8Memory0 = null; cachedUint8ClampedMemory0 = null; cachedInt32Memory0 = null; }\n');
    }
    manifest[name].files[path] = createHash('sha256').update(await readFile(output)).digest('hex');
  }
}
await writeFile(new URL('../supabase/functions/media-upload/vendor/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log('Códecs WASM y licencias copiados desde paquetes fijados.');
