import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { numText } from '../../utils/purchaseText';

const NOTE_MAX = 500;

/**
 * The bill check: the record's lines as ROMS has them, its files, an optional
 * note, and Save -- which sends it to the Purchase Head and locks its files
 * until a head sends it back. A sent-back record shows the head's reason.
 */
export default function CheckDialog({
  record, onFiles, onSave, onClose, saving,
}) {
  const [note, setNote] = useState('');
  const r = record;
  return (
    <Modal isOpen onClose={onClose} title={`Bill check — ${r.label}`} size="lg">
      {r.status === 'sent_back' && r.sent_back && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
          Sent back by the {r.sent_back.step === 'purchase' ? 'Purchase Head' : 'Accountant Head'} ({r.sent_back.name || 'someone'}): {r.sent_back.reason}
        </p>
      )}
      {r.status === 'changed' && (
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-3">
          ROMS changed this record after its last bill check, so its approvals were cleared. Check it against the bill again.
        </p>
      )}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              {['Billing / Challan', 'PO', 'Article', 'Rate', 'Qty', 'UOM'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.key} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono">{l.billing || '—'}</td>
                <td className="px-3 py-2">{l.po || '—'}</td>
                <td className="px-3 py-2">{l.article || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{numText(l.rate)}</td>
                <td className="px-3 py-2 tabular-nums">{numText(l.qty)}</td>
                <td className="px-3 py-2">{l.uom || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-sm text-gray-600">
          {r.files.length ? `${r.files.length} ${r.files.length === 1 ? 'file' : 'files'} attached` : 'No file attached yet.'}
        </p>
        <Button size="sm" variant="outline" onClick={onFiles}><Paperclip size={14} /> {r.files.length ? 'Files' : 'Attach the bill'}</Button>
      </div>
      <label htmlFor="check-note" className="block text-sm font-medium text-gray-700 mt-4 mb-1">Note (optional)</label>
      <textarea
        id="check-note"
        rows={2}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: bill matches the PO, or what was corrected"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <p className="text-xs text-gray-500 mt-2">
        Saving sends it to the Purchase Head. The files are locked from then on, so the heads approve what you checked.
      </p>
      <div className="flex gap-3 justify-end mt-4">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => onSave(note.trim())} loading={saving}>Save bill check</Button>
      </div>
    </Modal>
  );
}
