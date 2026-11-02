import test from 'node:test';
import assert from 'node:assert/strict';
import { centredCrop, clampCrop, cropRect, cropStyle, MAX_ZOOM, panCrop } from '../../src/domain/photo-crop.ts';

test('a new crop is the centred square of the short side', () => {
  assert.deepEqual(cropRect(centredCrop(4000, 3000)), { sx: 500, sy: 0, side: 3000, size: 512 });
  assert.deepEqual(cropRect(centredCrop(96, 64)), { sx: 16, sy: 0, side: 64, size: 64 });
  assert.deepEqual(cropStyle(centredCrop(400, 200)), { width: '200%', height: '100%', left: '-50%', top: '0%' });
});

test('panning follows the pointer and the square never leaves the image', () => {
  const view = centredCrop(400, 200);
  // Dragging right by a quarter of the viewport shows content to the left.
  assert.equal(panCrop(view, 50, 0, 200).x, 150);
  assert.equal(panCrop(view, 10_000, 0, 200).x, 100);
  assert.equal(panCrop(view, -10_000, 0, 200).x, 300);
  assert.equal(panCrop(view, 0, 50, 200).y, 100);
});

test('zoom is bounded and keeps the crop inside the image', () => {
  const zoomed = clampCrop({ ...centredCrop(400, 200), zoom: 2, x: 0, y: 0 });
  assert.deepEqual(cropRect(zoomed), { sx: 0, sy: 0, side: 100, size: 100 });
  assert.equal(clampCrop({ ...zoomed, zoom: 99 }).zoom, MAX_ZOOM);
  assert.equal(clampCrop({ ...zoomed, zoom: 0.2 }).zoom, 1);
  assert.equal(clampCrop({ ...zoomed, zoom: Number.NaN }).zoom, 1);
  // Zooming out from a corner pulls the square back inside.
  assert.deepEqual(cropRect(clampCrop({ ...zoomed, zoom: 1 })), { sx: 0, sy: 0, side: 200, size: 200 });
});
