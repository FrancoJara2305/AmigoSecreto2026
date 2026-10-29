import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
function color(variable: string) {
  const value = css.match(new RegExp(`${variable}: (#[0-9a-fA-F]{6});`))?.[1];
  assert.ok(value, `Missing color ${variable}`);
  return value;
}
function luminance(hex: string) {
  const [r,g,b] = [1,3,5].map((offset) => {
    const c = parseInt(hex.slice(offset, offset+2),16)/255;
    return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
  });
  return .2126*r+.7152*g+.0722*b;
}
test('design tokens meet text and control-boundary contrast targets', () => {
  for (const [foreground, background, minimum] of [
    ['--color-forest','--color-ivory',4.5], ['--color-forest','--color-cream',4.5],
    ['--color-christmas','--color-ivory',4.5], ['--color-ivory','--color-forest',4.5],
    ['--color-ivory','--color-christmas',4.5], ['--muted','--color-ivory',4.5],
    ['--muted','--color-cream',4.5], ['--color-gold','--color-forest',4.5],
    ['--border','--color-ivory',3],
  ] as const) {
    const a = luminance(color(foreground)); const b = luminance(color(background));
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=minimum, `${foreground} on ${background}`);
  }
});
