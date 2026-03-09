/**
 * PDF to Images utility
 * Uses pdf.js to render each PDF page to a canvas, then exports as base64 PNG.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export interface PdfPage {
  pageNumber: number;
  base64: string; // data:image/png;base64,...
  width: number;
  height: number;
}

/**
 * Convert a PDF file (as ArrayBuffer) to an array of page images.
 * Each page is rendered at the given scale (default 2x for decent quality).
 */
export async function pdfToImages(
  pdfData: ArrayBuffer,
  options?: { scale?: number; maxPages?: number }
): Promise<PdfPage[]> {
  const scale = options?.scale ?? 2;
  const maxPages = options?.maxPages ?? 20;

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = Math.min(pdf.numPages, maxPages);
  const pages: PdfPage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // pdfjs-dist RenderParameters requires canvas + canvasContext
    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as any).promise; // eslint-disable-line @typescript-eslint/no-explicit-any

    const dataUrl = canvas.toDataURL('image/png');
    pages.push({
      pageNumber: i,
      base64: dataUrl,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}
