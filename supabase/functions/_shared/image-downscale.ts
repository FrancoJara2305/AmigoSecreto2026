// Area-average downscale of RGBA pixels. Every source pixel contributes to exactly one output pixel,
// so large reductions keep fine detail instead of the jagged, grainy look of 4-tap bilinear sampling.
// Colour is weighted by alpha so transparent pixels never darken edges. Memory: one row of sums.
export function downscale(source: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }, width: number, height: number): Uint8ClampedArray {
  const { data, width: sw, height: sh } = source;
  if (width < 1 || height < 1 || width > sw || height > sh) throw new Error('Invalid downscale');
  // Column bounds: output x covers source columns [cols[x], cols[x + 1]), never empty.
  const cols = new Uint32Array(width + 1);
  for (let x = 0; x <= width; x++) cols[x] = Math.floor(x * sw / width);
  const out = new Uint8ClampedArray(width * height * 4);
  const sums = new Float64Array(width * 4);
  for (let y = 0, top = 0; y < height; y++) {
    const bottom = Math.floor((y + 1) * sh / height);
    sums.fill(0);
    for (let sy = top; sy < bottom; sy++) {
      const row = sy * sw * 4;
      for (let x = 0; x < width; x++) {
        const s = x * 4;
        for (let sx = cols[x]; sx < cols[x + 1]; sx++) {
          const p = row + sx * 4, a = data[p + 3];
          sums[s] += data[p] * a; sums[s + 1] += data[p + 1] * a; sums[s + 2] += data[p + 2] * a; sums[s + 3] += a;
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const s = x * 4, o = (y * width + x) * 4, area = (cols[x + 1] - cols[x]) * (bottom - top), alpha = sums[s + 3];
      if (alpha > 0) { out[o] = Math.round(sums[s] / alpha); out[o + 1] = Math.round(sums[s + 1] / alpha); out[o + 2] = Math.round(sums[s + 2] / alpha); }
      out[o + 3] = Math.round(alpha / area);
    }
    top = bottom;
  }
  return out;
}
