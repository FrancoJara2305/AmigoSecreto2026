import { MEDIA_OUTPUT } from '../../supabase/functions/_shared/image-inspection.ts';

// Square crop for profile photos, in the image's natural pixels. x/y is the centre of the crop.
export type CropView = { width: number; height: number; zoom: number; x: number; y: number };
export const MAX_ZOOM = 4;
// Matches the stored avatar size, so the server never has to resize the cropped square again.
export const AVATAR_SIZE = MEDIA_OUTPUT.avatar.side;

export const cropSide = ({ width, height, zoom }: CropView) => Math.min(width, height) / zoom;
export const centredCrop = (width: number, height: number): CropView => ({ width, height, zoom: 1, x: width / 2, y: height / 2 });
// Zoom stays between "whole short side" and MAX_ZOOM; the square never leaves the image.
export function clampCrop(view: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const half = cropSide({ ...view, zoom }) / 2;
  return { ...view, zoom, x: Math.min(view.width - half, Math.max(half, view.x)), y: Math.min(view.height - half, Math.max(half, view.y)) };
}
// Moving the pointer right by dx viewport pixels shows more of the left side of the image.
export function panCrop(view: CropView, dx: number, dy: number, viewport: number): CropView {
  const scale = cropSide(view) / Math.max(1, viewport);
  return clampCrop({ ...view, x: view.x - dx * scale, y: view.y - dy * scale });
}
export function cropRect(view: CropView) {
  const side = cropSide(view);
  return { sx: view.x - side / 2, sy: view.y - side / 2, side, size: Math.max(1, Math.min(AVATAR_SIZE, Math.round(side))) };
}
// Percentages of the square viewport, so the preview needs no layout measurement.
export function cropStyle(view: CropView) {
  const side = cropSide(view), pct = (value: number) => `${(value / side) * 100}%`;
  return { width: pct(view.width), height: pct(view.height), left: pct(side / 2 - view.x), top: pct(side / 2 - view.y) };
}
