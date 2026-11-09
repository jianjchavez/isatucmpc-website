import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { fillApplicationPdf } from '~/lib/pdf-fill';

afterEach(() => vi.unstubAllGlobals());

describe('pdf-fill', () => {
  it.each(['Regular', 'Associate'] as const)('draws the application number on page 1 and page 2 of the %s form', async variant => {
    vi.stubGlobal('fetch', async (url: string) => {
      const bytes = await readFile(resolve(process.cwd(), `public${url}`));
      return new Response(bytes, { status: 200 });
    });

    const bytes = await fillApplicationPdf(variant, { applicationNo: 'APP-2026-0001' });
    const pdf = await PDFDocument.load(bytes);
    const textHex = Buffer.from('APPLICATION NO. APP-2026-0001').toString('hex').toUpperCase();

    expect(pdf.getPageCount()).toBe(2);
    for (const page of pdf.getPages()) {
      const contents = page.node.Contents();
      expect(contents).toBeInstanceOf(PDFArray);
      if (!(contents instanceof PDFArray)) throw new Error('Expected PDF page contents array');
      const streams = Array.from({ length: contents.size() }, (_, i) => pdf.context.lookup(contents.get(i)))
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
        .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString());
      expect(streams.some(stream => stream.includes(`<${textHex}> Tj`))).toBe(true);
      const noteHex = Buffer.from('for the PMES quiz: isatucmpc.coop/pmes').toString('hex').toUpperCase();
      expect(streams.some(stream => stream.includes(`${noteHex}> Tj`))).toBe(true); // page 2 prints the note on one line
    }
  });
});
