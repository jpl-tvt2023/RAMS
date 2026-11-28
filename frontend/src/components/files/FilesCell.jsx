import { Paperclip, Upload } from 'lucide-react';
import { NO_FILE } from '../../utils/highlights';

// A row's files: a paperclip with how many, which opens them. A flagged row
// with none says "No file" on the orange fill; any other row with none is
// just a dash. Anyone who may attach files gets an Upload button too -- a
// real button with the upload arrow, so it reads as "attach a file here" (the
// user, 2026-11-28: a bare "Add" link didn't).
export default function FilesCell({
  files = [], what, flagged = false, canFiles, onOpen,
}) {
  if (files.length) {
    return (
      <button type="button" aria-label={`Files on ${what}`} onClick={onOpen} className="inline-flex items-center gap-1 text-brand hover:underline whitespace-nowrap">
        <Paperclip size={14} aria-hidden="true" />
        {files.length} {files.length === 1 ? 'file' : 'files'}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {flagged && (
        <span title={NO_FILE.help} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${NO_FILE.className}`}>
          <Paperclip size={12} aria-hidden="true" />
          {NO_FILE.label}
        </span>
      )}
      {canFiles && (
        <button
          type="button"
          aria-label={`Add a file to ${what}`}
          onClick={onOpen}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand/40 bg-white text-xs font-medium text-brand hover:bg-brand-surface whitespace-nowrap"
        >
          <Upload size={12} aria-hidden="true" />
          Upload
        </button>
      )}
      {!flagged && !canFiles && <span className="text-gray-400">—</span>}
    </span>
  );
}
