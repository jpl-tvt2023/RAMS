import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { HEAD_OF, SENT_BACK_TO } from '../../utils/purchaseText';

const REASON_MAX = 500;

/**
 * A head sends a record back, saying why, to the queue before them -- the
 * Purchase Head to the checker, the Accountant Head to the Purchase Head -- at
 * their step, or after approving it, even once it is approved.
 */
export default function SendBackDialog({
  record, step, onSend, onClose, saving,
}) {
  const [reason, setReason] = useState('');
  const approved = record.status === 'approved';
  const afterMine = record.status !== ({ purchase: 'with_purchase_head', accounts: 'with_accounts_head' })[step];
  const to = SENT_BACK_TO[step];
  return (
    <Modal isOpen onClose={onClose} title={`Send back — ${record.label}`} size="sm">
      {afterMine && (
        <p className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
          {approved
            ? `This line is approved. Sending it back clears both approvals and returns it to ${to}.`
            : `You approved this line already. Sending it back clears your approval and returns it to ${to}.`}
        </p>
      )}
      <p className="text-sm text-gray-600 mb-3">
        {step === 'accounts'
          ? 'It goes back to the Purchase Head with your reason, their approval cleared. They can approve it again, or send it on to the checker.'
          : `It goes back to the checker${record.check?.name ? ` (${record.check.name})` : ''} with your reason. Once they send it again, it comes to you first.`}
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
