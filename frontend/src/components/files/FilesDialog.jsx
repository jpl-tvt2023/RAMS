import Modal from '../ui/Modal';
import FilesPanel from './FilesPanel';

/**
 * One row's files in a window: view, download and -- for whoever may attach
 * files -- add (choose, drop, or paste with Ctrl+V) and remove (FilesPanel).
 * `target` is the row new files go on: a Tally voucher { companyId,
 * voucherGuid }, or a Purchase Reports record { purchaseRecordId }. `files`
 * comes from the page, which reloads it through onChanged (a purchase
 * record's files carry store: 'purchase').
 */
export default function FilesDialog({
  title, subtitle, files, target, canEdit = false, onClose, onChanged,
}) {
  return (
    <Modal isOpen onClose={onClose} title={`Files — ${title}`} size="lg">
      {subtitle && <p className="text-sm text-gray-500 mb-3">{subtitle}</p>}
      <FilesPanel what={title} files={files} target={target} canEdit={canEdit} onChanged={onChanged} />
    </Modal>
  );
}
