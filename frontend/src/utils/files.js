// Files on Party Statements rows, as the browser gets them ready before they are sent
// (the server side is backend/src/services/files.js). A photo is shrunk to
// at most 2000 px on its long side and saved as JPEG, which keeps a DN or an
// invoice readable at a tenth of the size. A PDF or an email is compressed
// without loss when that helps, and a download gives back the exact bytes
// that were picked.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.8;
// A photo this small, and within the size, is sent as it is.
const SMALL_PHOTO = 600 * 1024;

// What the file picker offers. image/* lets a phone open its camera.
export const ACCEPT = '.pdf,application/pdf,image/*,.eml,.msg,message/rfc822,application/vnd.ms-outlook';

export const KINDS = {
  pdf: { label: 'PDF' },
  image: { label: 'Photo' },
  email: { label: 'Email' },
};

export const ALLOWED = 'PDFs, photos (JPG, PNG or WebP) and emails (.eml or .msg)';
const MB = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
export const TOO_BIG = `A file can be at most ${MB(MAX_UPLOAD_BYTES)} after RAMS compresses it. Save a PDF smaller (for example "Reduce file size" or print it to PDF again), or save an email without its attachments and add those PDFs separately.`;

const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

/**
 * What a picked file is, from its name and the type the browser gives:
 * 'pdf', 'image', 'email', 'heic' (a photo browsers can't read) or null. The
 * server checks the bytes themselves.
 */
export function kindOf(name, type = '') {
  const ext = extOf(name);
  const t = String(type || '').toLowerCase();
  if (ext === 'pdf' || t === 'application/pdf') return 'pdf';
  if (['heic', 'heif'].includes(ext) || ['image/heic', 'image/heif'].includes(t)) return 'heic';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || ['image/jpeg', 'image/png', 'image/webp'].includes(t)) return 'image';
  if (['eml', 'msg'].includes(ext) || ['message/rfc822', 'application/vnd.ms-outlook'].includes(t)) return 'email';
  return null;
}

// "245 KB", "3.2 MB"
export function sizeText(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

// Fits w x h inside max x max, keeping the shape. Never scales up.
export function fitWithin(w, h, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

// Why a picked file can't be added, or null when it can.
export function refusal(file) {
  const kind = kindOf(file.name, file.type);
  if (kind === 'heic') return `${file.name} is a HEIC photo, which browsers can't read. On an iPhone, share it as JPEG (or set Settings → Camera → Formats to Most Compatible), or take a screenshot of it.`;
  if (!kind) return `RAMS takes ${ALLOWED}. "${file.name}" isn't one of them.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

const withExt = (name, ext) => `${String(name).replace(/\.[a-z0-9]+$/i, '')}.${ext}`;

// A photo at most MAX_SIDE on its long side, as JPEG, the right way up. The
// original is kept when it is already small, or when shrinking wouldn't help.
async function shrinkPhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name} couldn't be read as a photo. Save it as JPEG or PNG and try again.`);
  }
  try {
    const { width, height, scale } = fitWithin(bitmap.width, bitmap.height);
    if (scale === 1 && file.size <= SMALL_PHOTO) return { blob: file, name: file.name, gzip: false };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY); });
    if (!jpeg || jpeg.size >= file.size) return { blob: file, name: file.name, gzip: false };
    return { blob: jpeg, name: withExt(file.name, 'jpg'), gzip: false };
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

// A PDF or an email as gzip, when that saves at least a tenth and the browser
// can do it. Otherwise as it is: the server compresses it itself.
async function packed(file) {
  if (typeof CompressionStream !== 'function' || typeof file.stream !== 'function') return { blob: file, name: file.name, gzip: false };
  try {
    const gz = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    if (gz.size <= file.size * 0.9) return { blob: gz, name: file.name, gzip: true };
  } catch { /* sent as it is */ }
  return { blob: file, name: file.name, gzip: false };
}

/**
 * A picked file ready to send: { blob, name, gzip, kind, originalSize }.
 * Throws an Error whose message says what to do when it can't be.
 */
export async function prepareFile(file) {
  const why = refusal(file);
  if (why) throw new Error(why);
  const kind = kindOf(file.name, file.type);
  const out = kind === 'image' ? await shrinkPhoto(file) : await packed(file);
  if (out.blob.size > MAX_UPLOAD_BYTES) throw new Error(TOO_BIG);
  return { ...out, kind, originalSize: file.size };
}

const pad = (n) => String(n).padStart(2, '0');

// "Screenshot 2026-11-16 14.32.png"
export const screenshotName = (type, d = new Date()) => `Screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;

/**
 * The files on the clipboard when someone presses Ctrl+V: a copied screenshot
 * or snip (named by the moment it was pasted, since the browser calls it
 * image.png), or files copied from a folder.
 */
export function pastedFiles(clipboardData, now = new Date()) {
  const out = [];
  for (const item of clipboardData?.items || []) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (!f) continue;
    const unnamed = !f.name || /^image\.(png|jpe?g|webp)$/i.test(f.name);
    out.push(unnamed ? new File([f], screenshotName(f.type, now), { type: f.type }) : f);
  }
  return out;
}
