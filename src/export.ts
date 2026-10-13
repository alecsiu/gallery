import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WallSvg, worldMargin } from './components/WallSvg';
import { serializeLayout } from './storage';
import type { Layout, Unit } from './types';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (name: string) => name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'gallery-wall';

export function exportJson(layout: Layout) {
  downloadBlob(new Blob([serializeLayout(layout)], { type: 'application/json' }), `${safeName(layout.name)}.gallery.json`);
}

/** Renders the wall (with dimension lines) to a PNG and downloads it. */
export async function exportPng(layout: Layout, unit: Unit): Promise<void> {
  const m = worldMargin(layout.wall);
  const pxPerInch = Math.min(24, Math.max(4, 2400 / (layout.wall.w + 2 * m)));
  const markup = renderToStaticMarkup(
    createElement(WallSvg, { layout, unit, scale: pxPerInch, showDims: true, selectedId: null }),
  );
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the wall to an image'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((layout.wall.w + 2 * m) * pxPerInch);
    canvas.height = Math.round((layout.wall.h + 2 * m) * pxPerInch);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create the PNG');
    downloadBlob(blob, `${safeName(layout.name)}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
