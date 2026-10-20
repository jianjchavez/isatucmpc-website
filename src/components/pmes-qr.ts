import QRCode from 'qrcode';
import { COLORS } from '~/lib/brand';
import { ORG_WEBSITE_URL } from '~/lib/letterhead';

/**
 * Navy vector QR of the website (Brand Guide Amendment No. 1): squares only,
 * never a raster image. `sizeMm` is the printed edge length.
 */
export function siteQrSvg(sizeMm = 12, url = ORG_WEBSITE_URL): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (data[y * n + x]) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" ` +
    `width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR code: ${url}"><g fill="${COLORS.navy}">${rects}</g></svg>`
  );
}
