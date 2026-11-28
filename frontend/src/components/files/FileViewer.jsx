import {
  useEffect, useEffectEvent, useRef, useState,
} from 'react';
import {
  ChevronLeft, ChevronRight, Download, X, FileText, Mail,
} from 'lucide-react';
import Button from '../ui/Button';
import { fetchFile } from '../../api/files.api';
import { saveBlob } from '../../utils/saveBlob';
import { openPdf, PAGE_LIMIT } from '../../utils/pdf';
import { KINDS, sizeText } from '../../utils/files';
import { reasonOf } from './useFileUploads';
import { KIND_ICON } from './icons';

// A message in the middle of the viewer, with a Download button.
function Panel({
  icon: Icon, title, children, onDownload, busy,
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 max-w-md text-center">
        {Icon && <Icon size={32} className="mx-auto text-gray-400" aria-hidden="true" />}
        <p className="mt-3 font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-600">{children}</p>
        <Button className="mt-4" onClick={onDownload} loading={busy}><Download size={14} /> Download</Button>
      </div>
    </div>
  );
}

// A PDF's pages, drawn one under the other at the viewer's width.
function PdfPages({ blob, onDownload, busy }) {
  const box = useRef(null);
  const canvases = useRef([]);
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let opened = null;
    openPdf(blob)
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else d.close();
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (opened) opened.close();
    };
  }, [blob]);

  useEffect(() => {
    if (!doc) return undefined;
    let alive = true;
    const width = Math.max(280, Math.min(1100, (box.current?.clientWidth || 800) - 8));
    (async () => {
      for (let n = 1; n <= Math.min(doc.pages, PAGE_LIMIT) && alive; n += 1) {
        const canvas = canvases.current[n - 1];
        if (!canvas) continue;
        try {
          await doc.render(n, canvas, width);
        } catch {
          if (alive) setFailed(true);
          return;
        }
      }
    })();
    return () => { alive = false; };
  }, [doc]);

  if (failed) {
    return (
      <Panel icon={FileText} title="This PDF can’t be shown here" onDownload={onDownload} busy={busy}>
        This browser couldn’t draw it. Download it and open it in your PDF reader.
      </Panel>
    );
  }
  if (!doc) return <p className="text-sm text-gray-500 text-center py-10">Opening the PDF…</p>;
  const shown = Math.min(doc.pages, PAGE_LIMIT);
  return (
    <div ref={box} className="space-y-3">
      {Array.from({ length: shown }, (_, i) => (
        <canvas
          key={i}
          ref={(el) => { canvases.current[i] = el; }}
          aria-label={`Page ${i + 1} of ${doc.pages}`}
          className="mx-auto block bg-white shadow border border-gray-200"
        />
      ))}
      {doc.pages > shown && <p className="text-sm text-gray-600 text-center">Showing the first {shown} of {doc.pages} pages. Download it to see the rest.</p>}
    </div>
  );
}

function Photo({ url, name }) {
  const [full, setFull] = useState(false);
  return (
    <button type="button" onClick={() => setFull((f) => !f)} className={`block mx-auto ${full ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
      title={full ? 'Click to fit the window' : 'Click for full size'}>
      <img src={url} alt={name} className={full ? 'max-w-none' : 'max-w-full max-h-[calc(92vh-7rem)] object-contain'} />
    </button>
  );
}

/**
 * A row's files, one at a time, inside RAMS: a PDF's pages, a photo, or --
 * for an email, which RAMS keeps exactly as it was saved and doesn't open --
 * a Download button. Previous / Next (or the arrow keys) go through the
 * row's files; Escape closes.
 */
export default function FileViewer({ files, start = 0, onClose }) {
  const [at, setAt] = useState(start);
  const [loaded, setLoaded] = useState({}); // id -> { blob, url } | { error }
  const [busy, setBusy] = useState(false);
  const requested = useRef(new Set());
  const urls = useRef([]);
  const closeButton = useRef(null);
  const file = files[Math.min(at, files.length - 1)];
  const many = files.length > 1;
  const go = (step) => setAt((i) => (i + step + files.length) % files.length);

  // Each PDF or photo is fetched once, when it is first shown.
  useEffect(() => {
    if (!file || file.kind === 'email' || requested.current.has(file.id)) return;
    requested.current.add(file.id);
    fetchFile(file.id, file.store)
      .then((blob) => {
        const url = file.kind === 'image' ? URL.createObjectURL(blob) : null;
        if (url) urls.current.push(url);
        setLoaded((m) => ({ ...m, [file.id]: { blob, url } }));
      })
      .catch((err) => setLoaded((m) => ({ ...m, [file.id]: { error: reasonOf(err) } })));
  }, [file]);

  useEffect(() => {
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const onKey = useEffectEvent((e) => {
    if (e.key === 'Escape') onClose();
    else if (many && e.key === 'ArrowLeft') go(-1);
    else if (many && e.key === 'ArrowRight') go(1);
  });
  useEffect(() => {
    const handler = (e) => onKey(e);
    document.addEventListener('keydown', handler);
    closeButton.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!file) return null;
  const got = loaded[file.id];
  const Icon = KIND_ICON[file.kind] || FileText;

  const download = async () => {
    setBusy(true);
    try {
      saveBlob(file.name, got?.blob || await fetchFile(file.id, file.store));
    } catch (err) {
      setLoaded((m) => ({ ...m, [file.id]: { ...m[file.id], error: reasonOf(err) } }));
    } finally { setBusy(false); }
  };

  let body;
  if (file.kind === 'email') {
    body = (
      <Panel icon={Mail} title="Emails open in your mail program" onDownload={download} busy={busy}>
        RAMS keeps the email exactly as it was saved, with its attachments. Download it and open it in Outlook or your mail app.
      </Panel>
    );
  } else if (got?.error) {
    body = <Panel icon={Icon} title="This file couldn’t be opened" onDownload={download} busy={busy}>{got.error}</Panel>;
  } else if (!got) {
    body = <p className="text-sm text-gray-500 text-center py-10">Opening {file.name}…</p>;
  } else if (file.kind === 'pdf') {
    body = <PdfPages key={file.id} blob={got.blob} onDownload={download} busy={busy} />;
  } else {
    body = <Photo key={file.id} url={got.url} name={file.name} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`View ${file.name}`} className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100">
          <Icon size={18} className="text-gray-500 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 truncate" title={file.name}>{file.name}</h2>
            <p className="text-xs text-gray-500">
              {KINDS[file.kind]?.label || 'File'} · {sizeText(file.size)}{many ? ` · ${at + 1} of ${files.length}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {many && (
              <>
                <button type="button" aria-label="Previous file" onClick={() => go(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><ChevronLeft size={18} /></button>
                <button type="button" aria-label="Next file" onClick={() => go(1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600"><ChevronRight size={18} /></button>
              </>
            )}
            {file.kind !== 'email' && <Button size="sm" variant="outline" onClick={download} loading={busy}><Download size={14} /> Download</Button>}
            <button ref={closeButton} type="button" aria-label="Close the viewer" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-100 p-3 sm:p-4">{body}</div>
      </div>
    </div>
  );
}
