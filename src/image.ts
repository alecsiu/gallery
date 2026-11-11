import { detectQuad } from './detect';
import { isConvexQuad, orderQuad, quadSize, warpQuad } from './warp';
import type { Point, Quad } from './warp';

/** Downscales an image file to a small JPEG data URL so layouts stay light enough for local storage. */
export function fileToThumbnail(file: File, maxSide = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas is not available'));
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

export function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

/**
 * Cuts the outlined piece out of a photo and straightens it into a JPEG data URL.
 * `corners` are fractions of the photo's width and height, in any order.
 */
export function straightenPhoto(img: HTMLImageElement, corners: readonly Point[], maxSide = 640): string {
  const natural = orderQuad(corners.map((c) => ({ x: c.x * img.naturalWidth, y: c.y * img.naturalHeight })));
  const size = quadSize(natural);
  const long = Math.max(size.w, size.h);
  if (!isConvexQuad(natural) || long < 8) throw new Error('Drag the corners so they outline the piece');
  const outScale = Math.min(1, maxSide / long);
  const outW = Math.max(1, Math.round(size.w * outScale));
  const outH = Math.max(1, Math.round(size.h * outScale));
  // Let the browser do a filtered downscale first, so a large photo doesn't alias when sampled.
  const srcScale = Math.min(1, (1.5 * maxSide) / long);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = Math.max(1, Math.round(img.naturalWidth * srcScale));
  srcCanvas.height = Math.max(1, Math.round(img.naturalHeight * srcScale));
  const srcCtx = srcCanvas.getContext('2d');
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!srcCtx || !outCtx) throw new Error('Canvas is not available');
  srcCtx.fillStyle = '#fff';
  srcCtx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
  srcCtx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);
  const quad = natural.map((p) => ({ x: p.x * srcScale, y: p.y * srcScale })) as Quad;
  const warped = warpQuad(srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height), quad, outW, outH);
  const imageData = outCtx.createImageData(outW, outH);
  imageData.data.set(warped.data);
  outCtx.putImageData(imageData, 0, 0);
  return outCanvas.toDataURL('image/jpeg', 0.85);
}

/** Looks for the piece in a photo. Returns corners as fractions of the photo, or null when unsure. */
export function detectPiece(img: HTMLImageElement, maxSide = 256): Quad | null {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return detectQuad(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return null;
  }
}
