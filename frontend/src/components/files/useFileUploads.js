import { useState } from 'react';
import { prepareFile } from '../../utils/files';
import { uploadFile } from '../../api/files.api';

// Why adding a file failed, in the words the server or prepareFile gave.
export const reasonOf = (err) => err?.response?.data?.message || err?.message || 'Adding it failed';

/**
 * Gets one picked file ready (a photo shrunk, a PDF or email compressed) and
 * sends it to its row. target: { companyId, entryId } or { companyId,
 * voucherGuid }. Resolves to the stored file; rejects with what to do.
 */
export async function sendFile(file, target, onProgress) {
  const ready = await prepareFile(file);
  return uploadFile({
    ...target, name: ready.name, blob: ready.blob, gzip: ready.gzip, originalSize: ready.originalSize,
  }, onProgress);
}

/**
 * Files being added to one row, one after another: { queue, add, dismiss }.
 * Each queued file is { key, name, state: 'waiting'|'sending'|'failed',
 * progress, error }. A file that goes in leaves the queue -- the row's list
 * shows it once onAdded (which reloads the row) has run.
 */
export function useFileUploads(target, onAdded) {
  const [queue, setQueue] = useState([]);

  const add = async (picked) => {
    const items = [...(picked || [])].map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`, file, name: file.name, state: 'waiting', progress: 0, error: null,
    }));
    if (!items.length) return;
    setQueue((q) => [...q, ...items]);
    const added = [];
    for (const item of items) {
      const patch = (p) => setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, ...p } : x)));
      patch({ state: 'sending' });
      try {
        added.push(await sendFile(item.file, target, (progress) => patch({ progress })));
        setQueue((q) => q.filter((x) => x.key !== item.key));
      } catch (err) {
        patch({ state: 'failed', error: reasonOf(err) });
      }
    }
    if (added.length && onAdded) onAdded(added);
  };

  const dismiss = (key) => setQueue((q) => q.filter((x) => x.key !== key));

  return { queue, add, dismiss };
}
