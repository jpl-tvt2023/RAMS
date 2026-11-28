import api from './axios';

// Files on Party Statements rows (backend controllers/files.controller.js): PDFs,
// photos and emails on a Tally voucher. Adding and removing is statements.files;
// seeing and downloading is statements.view or reports.view (Bills Receivable shows an
// invoice's files); the storage figures are Admin and Owner only.
//
// Files on a Purchase Reports record (controllers/purchases.controller.js) use
// the same store: their target is { purchaseRecordId }, and each such file
// carries store: 'purchase', which fetchFile and deleteFile follow.
const base = (store) => (store === 'purchase' ? '/purchases/files' : '/files');

// The file goes as the request body, after utils/files.js prepared it
// (gzip when `gzip`). A purchase target may name `also`: other records (the
// ticked lines of its delivery) the same file goes on, stored once.
// -> { id, name, kind, size, uploaded_by_name, uploaded_at, stored_once, also? }
export async function uploadFile({
  companyId, voucherGuid, purchaseRecordId, also, name, blob, gzip, originalSize,
}, onProgress) {
  const purchase = purchaseRecordId != null;
  const { data } = await api.post(purchase ? `/purchases/records/${purchaseRecordId}/files` : '/files', blob, {
    params: {
      ...(purchase ? { also: also?.length ? also.join(',') : undefined } : { company_id: companyId, voucher_guid: voucherGuid }),
      name,
      gzip: gzip ? 1 : undefined,
      original_size: originalSize || undefined,
    },
    headers: { 'Content-Type': 'application/octet-stream' },
    onUploadProgress: onProgress ? (e) => onProgress(e.total ? e.loaded / e.total : 0) : undefined,
  });
  return purchase ? { ...data, store: 'purchase' } : data;
}

// The file as a Blob: a PDF or email exactly as it was picked, or the shrunk
// photo. (A plain link can't send the sign-in token, so it comes this way.)
export async function fetchFile(id, store) {
  const { data } = await api.get(`${base(store)}/${id}`, { responseType: 'blob' });
  return data;
}

// A purchase file may name `also`: other records the same file comes off too.
export async function deleteFile(id, store, { also } = {}) {
  const params = store === 'purchase' && also?.length ? { also: also.join(',') } : undefined;
  const { data } = await api.delete(`${base(store)}/${id}`, params ? { params } : undefined);
  return data;
}

// { files, stored_files, picked_bytes, stored_bytes, saved_bytes, max_upload_bytes,
//   kinds: [{ kind, files, picked_bytes, stored_bytes }], biggest: [{ id, name, kind, size, stored_size, company, on, ... }] }
export async function getFileUsage() {
  const { data } = await api.get('/files/usage');
  return data;
}
