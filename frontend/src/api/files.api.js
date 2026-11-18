import api from './axios';

// Files on Party Statements rows (backend controllers/files.controller.js): PDFs,
// photos and emails on a Tally voucher. Adding and removing is statements.files;
// seeing and downloading is statements.view or reports.view (Bills Receivable shows an
// invoice's files); the storage figures are Admin and Owner only.

// The file goes as the request body, after utils/files.js prepared it
// (gzip when `gzip`). -> { id, name, kind, size, uploaded_by_name, uploaded_at, stored_once }
export async function uploadFile({
  companyId, voucherGuid, name, blob, gzip, originalSize,
}, onProgress) {
  const { data } = await api.post('/files', blob, {
    params: {
      company_id: companyId,
      voucher_guid: voucherGuid,
      name,
      gzip: gzip ? 1 : undefined,
      original_size: originalSize || undefined,
    },
    headers: { 'Content-Type': 'application/octet-stream' },
    onUploadProgress: onProgress ? (e) => onProgress(e.total ? e.loaded / e.total : 0) : undefined,
  });
  return data;
}

// The file as a Blob: a PDF or email exactly as it was picked, or the shrunk
// photo. (A plain link can't send the sign-in token, so it comes this way.)
export async function fetchFile(id) {
  const { data } = await api.get(`/files/${id}`, { responseType: 'blob' });
  return data;
}

export async function deleteFile(id) {
  const { data } = await api.delete(`/files/${id}`);
  return data;
}

// { files, stored_files, picked_bytes, stored_bytes, saved_bytes, max_upload_bytes,
//   kinds: [{ kind, files, picked_bytes, stored_bytes }], biggest: [{ id, name, kind, size, stored_size, company, on, ... }] }
export async function getFileUsage() {
  const { data } = await api.get('/files/usage');
  return data;
}
