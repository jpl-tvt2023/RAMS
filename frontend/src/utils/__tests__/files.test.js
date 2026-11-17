import { describe, test, expect } from 'vitest';
import {
  kindOf, fitWithin, sizeText, refusal, prepareFile, pastedFiles, screenshotName, MAX_UPLOAD_BYTES, TOO_BIG,
} from '../files';

// Bytes that don't compress, so gzip can't bring a file under the limit.
function noise(n) {
  const out = new Uint8Array(n);
  let x = 2463534242;
  for (let i = 0; i < n; i += 1) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

describe('files, before they are sent', () => {
  test('what a picked file is, from its name or type', () => {
    expect(kindOf('DN FKIDN1.pdf')).toBe('pdf');
    expect(kindOf('scan', 'application/pdf')).toBe('pdf');
    expect(kindOf('photo.JPG')).toBe('image');
    expect(kindOf('shot.png')).toBe('image');
    expect(kindOf('x.webp')).toBe('image');
    expect(kindOf('mail.eml')).toBe('email');
    expect(kindOf('mail.msg')).toBe('email');
    expect(kindOf('IMG_0001.HEIC')).toBe('heic');
    expect(kindOf('sheet.xlsx')).toBeNull();
    expect(kindOf('setup.exe', 'application/octet-stream')).toBeNull();
  });

  test('a photo fits inside 2000 px, keeping its shape, and is never made bigger', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500, scale: 0.5 });
    expect(fitWithin(3000, 6000)).toMatchObject({ width: 1000, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  test('sizes read the way people say them', () => {
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(250 * 1024)).toBe('250 KB');
    expect(sizeText(3.25 * 1048576)).toBe('3.3 MB');
    expect(sizeText(MAX_UPLOAD_BYTES)).toBe('4.0 MB');
  });

  test('a file RAMS can’t take says what to do', () => {
    expect(refusal(new File(['x'], 'IMG_0001.heic'))).toMatch(/share it as JPEG/);
    expect(refusal(new File(['x'], 'list.xlsx'))).toMatch(/RAMS takes PDFs, photos .* and emails/);
    expect(refusal(new File([], 'empty.pdf'))).toMatch(/empty/);
    expect(refusal(new File(['%PDF-1.4'], 'dn.pdf'))).toBeNull();
  });

  test('a PDF goes as it is or compressed, with its size as picked', async () => {
    const pdf = new File([`%PDF-1.4\n${'1 0 obj << >> endobj\n'.repeat(500)}`], 'dn.pdf', { type: 'application/pdf' });
    const ready = await prepareFile(pdf);
    expect(ready).toMatchObject({ name: 'dn.pdf', kind: 'pdf', originalSize: pdf.size });
    expect(ready.blob.size).toBeLessThanOrEqual(pdf.size);
    expect(typeof ready.gzip).toBe('boolean');
  });

  test('a file still over 4 MB after compressing is refused with what to do', async () => {
    const big = new File([noise(MAX_UPLOAD_BYTES + 1000)], 'scan.pdf', { type: 'application/pdf' });
    await expect(prepareFile(big)).rejects.toThrow(TOO_BIG);
    await expect(prepareFile(new File(['x'], 'IMG.heic'))).rejects.toThrow(/HEIC/);
  });

  test('Ctrl+V: a copied screenshot gets a name with the date and time; text is left alone', () => {
    const at = new Date(2026, 10, 16, 14, 32);
    expect(screenshotName('image/png', at)).toBe('Screenshot 2026-11-16 14.32.png');
    const shot = new File(['png'], 'image.png', { type: 'image/png' });
    const copied = new File(['%PDF'], 'DN 51.pdf', { type: 'application/pdf' });
    const clipboard = {
      items: [
        { kind: 'file', getAsFile: () => shot },
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => copied },
      ],
    };
    expect(pastedFiles(clipboard, at).map((f) => f.name)).toEqual(['Screenshot 2026-11-16 14.32.png', 'DN 51.pdf']);
    expect(pastedFiles({ items: [{ kind: 'string' }] })).toEqual([]);
    expect(pastedFiles(null)).toEqual([]);
  });
});
