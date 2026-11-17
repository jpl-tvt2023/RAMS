import {
  useEffect, useEffectEvent, useRef, useState,
} from 'react';
import toast from 'react-hot-toast';
import {
  Download, Eye, Paperclip, Trash2, Upload, CircleAlert, LoaderCircle, X,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import FileViewer from './FileViewer';
import { KIND_ICON } from './icons';
import { useFileUploads, reasonOf } from './useFileUploads';
import { fetchFile, deleteFile } from '../../api/files.api';
import { saveBlob } from '../../utils/csv';
import {
  ACCEPT, KINDS, MAX_UPLOAD_BYTES, pastedFiles, sizeText,
} from '../../utils/files';
import { formatDateTime } from '../../utils/formatters';

/**
 * One row's files: view, download and -- for whoever may attach files --
 * add (choose, drop, or paste with Ctrl+V) and remove. `target` is the Tally
 * voucher new files go on: { companyId, voucherGuid }. `files` comes from the
 * page, which reloads it through onChanged.
 */
export default function FilesDialog({
  title, subtitle, files, target, canEdit = false, onClose, onChanged,
}) {
  const [viewing, setViewing] = useState(null); // index into files
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const { queue, add, dismiss } = useFileUploads(target, (added) => {
    toast.success(added.length === 1 ? `Added ${added[0].name}` : `Added ${added.length} files`);
    if (onChanged) onChanged();
  });

  // Ctrl+V anywhere while the window is open: a copied screenshot, a snip, or
  // files copied from a folder. Text pastes are left alone.
  const onPaste = useEffectEvent((e) => {
    const picked = pastedFiles(e.clipboardData);
    if (!picked.length) return;
    e.preventDefault();
    add(picked);
  });
  useEffect(() => {
    if (!canEdit) return undefined;
    const handler = (e) => onPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [canEdit]);

  const download = async (f) => {
    setDownloading(f.id);
    try {
      saveBlob(f.name, await fetchFile(f.id));
    } catch (err) {
      toast.error(reasonOf(err));
    } finally { setDownloading(null); }
  };

  const remove = async () => {
    setRemoveBusy(true);
    try {
      await deleteFile(removing.id);
      toast.success(`Removed ${removing.name}`);
      setRemoving(null);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(reasonOf(err));
    } finally { setRemoveBusy(false); }
  };

  const pick = (e) => {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    add(list);
  };

  return (
    <>
      <Modal isOpen onClose={onClose} title={`Files — ${title}`} size="lg">
        {subtitle && <p className="text-sm text-gray-500 mb-3">{subtitle}</p>}
        {files.length > 0 ? (
          <ul aria-label="Files" className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {files.map((f, i) => {
              const Icon = KIND_ICON[f.kind] || Paperclip;
              return (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <Icon size={18} className="text-gray-500 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate" title={f.name}>{f.name}</p>
                    <p className="text-xs text-gray-500">
                      {KINDS[f.kind]?.label || 'File'} · {sizeText(f.size)} · {f.uploaded_by_name || 'someone'}, {formatDateTime(f.uploaded_at)}
                    </p>
                  </div>
                  {f.kind !== 'email' && (
                    <Button size="sm" variant="ghost" aria-label={`View ${f.name}`} onClick={() => setViewing(i)}><Eye size={14} /> View</Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`Download ${f.name}`} loading={downloading === f.id} onClick={() => download(f)}>
                    <Download size={14} />{f.kind === 'email' ? ' Download' : ''}
                  </Button>
                  {canEdit && (
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Trash2 size={14} /></button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-4 text-center">No file yet.</p>
        )}

        {queue.length > 0 && (
          <ul aria-label="Being added" className="mt-3 space-y-1">
            {queue.map((q) => (
              <li key={q.key} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${q.state === 'failed' ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'}`}>
                {q.state === 'failed'
                  ? <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  : <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{q.name}</p>
                  <p className="text-xs">
                    {q.state === 'failed' && <>Not added: {q.error}</>}
                    {q.state === 'waiting' && 'Waiting…'}
                    {q.state === 'sending' && (q.progress > 0 ? `Sending… ${Math.round(q.progress * 100)}%` : 'Getting it ready…')}
                  </p>
                </div>
                {q.state === 'failed' && (
                  <button type="button" aria-label={`Dismiss ${q.name}`} onClick={() => dismiss(q.key)} className="p-1 rounded hover:bg-red-100"><X size={14} /></button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); add([...(e.dataTransfer?.files || [])]); }}
            className={`mt-4 border-2 border-dashed rounded-lg px-4 py-5 text-center text-sm transition-colors ${dragging ? 'border-brand bg-brand-surface text-brand' : 'border-gray-300 text-gray-600'}`}
          >
            <Upload size={20} className="mx-auto text-gray-400" aria-hidden="true" />
            <p className="mt-1">Drop PDFs, photos or emails here, or</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => input.current?.click()}><Paperclip size={14} /> Choose files</Button>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Choose files to add" onChange={pick} />
            <p className="text-xs text-gray-500 mt-3">
              Or press Ctrl+V to paste a screenshot. Photos are made smaller; PDFs and emails are kept exactly as they are.
              Up to {sizeText(MAX_UPLOAD_BYTES)} each after RAMS compresses it.
            </p>
          </div>
        )}
      </Modal>

      {viewing != null && <FileViewer files={files} start={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={removeBusy}
        title="Remove this file?"
        message={removing ? `${removing.name} comes off ${title}. The removal is kept in the audit log.` : ''}
        confirmLabel="Remove"
      />
    </>
  );
}
