// pdf.js, loaded only when a PDF is opened, so the rest of RAMS doesn't carry
// it. The site's security policy allows no WebAssembly, so the decoders for
// rare image types (JPEG 2000, JBIG2) run as JavaScript, served from
// /pdfjs-wasm/ -- copied out of node_modules when a dev server or build
// starts (scripts/copy-pdfjs.js, run by vite.config.js).
export const PAGE_LIMIT = 50;

let lib = null;

function pdfjs() {
  if (!lib) {
    lib = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([mod, worker]) => {
      mod.GlobalWorkerOptions.workerSrc = worker.default;
      return mod;
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

/**
 * Opens a PDF: { pages, render(pageNumber, canvas, width), close() }. render
 * draws one page on the canvas at that CSS width, sharp on a high-density
 * screen, and gives { width, height } in CSS pixels.
 */
export async function openPdf(blob) {
  const mod = await pdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = mod.getDocument({
    data,
    isEvalSupported: false,
    useWasm: false,
    wasmUrl: new URL('/pdfjs-wasm/', window.location.origin).href,
  });
  const doc = await task.promise;
  return {
    pages: doc.numPages,
    async render(pageNumber, canvas, width) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      page.cleanup();
      return { width: Math.floor(viewport.width / dpr), height: Math.floor(viewport.height / dpr) };
    },
    // pdf.js 6 frees a document through its loading task (the document has
    // no destroy of its own). Never throws: closing runs as the viewer goes.
    close: () => { task.destroy().catch(() => {}); },
  };
}
