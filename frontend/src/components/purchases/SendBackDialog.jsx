import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { HEAD_OF } from '../../utils/purchaseText';

const REASON_MAX = 500;

/** A head sends a record back to the bill check, saying why. */
export default function SendBackDialog({
  record, step, onSend, onClose, saving,
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal isOpen onClose={onClose} title={`Send back — ${record.label}`} size="sm">
      <p className="text-sm text-gray-600 mb-3">
        It goes back to the bill check{record.check?.name ? ` (${record.check.name})` : ''} with your reason. Once it is checked again, it comes to the Purchase Head first.
      </p>
      <label htmlFor="send-back-reason" className="block text-sm font-medium text-gray-700 mb-1">Why? (required)</label>
      <textarea
        id="send-back-reason"
        rows={3}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: the rate on the bill is 20, not 19.75"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <div className="flex gap-3 justify-end mt-4">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="danger" onClick={() => onSend(reason.trim())} loading={saving} disabled={!reason.trim()}>Send back as {HEAD_OF[step]}</Button>
      </div>
    </Modal>
  );
}
