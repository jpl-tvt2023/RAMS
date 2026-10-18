import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { createLedgerEntry, updateLedgerEntry } from '../../api/ledgers.api';
import { KINDS, KIND, paiseFrom } from '../../utils/ledgerText';
import { formatRupees } from '../../utils/formatters';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';
const blank = (date) => ({
  kind: 'invoice', number: '', reference: '', amount: '', date, note: '',
});
const fromEntry = (e) => ({
  kind: e.kind, number: e.number || '', reference: e.reference || '', amount: (e.amount_paise / 100).toFixed(2), date: e.date, note: e.note || '',
});

// Add or change one entry of a party's day: what it is, its number, the
// amount, and a sentence saying which way it moves what the party owes.
// Mounted afresh for each entry (the parent keys it), so the form starts from
// that entry.
export default function EntryForm({
  party, companyId, ledgerGuid, date, entry, minDate, maxDate, onClose, onSaved,
}) {
  const [f, setF] = useState(() => (entry ? fromEntry(entry) : blank(date)));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const kind = KIND[f.kind];
  const paise = paiseFrom(f.amount);

  const save = async (e) => {
    e.preventDefault();
    if (kind.key !== 'receipt' && !f.number.trim()) { toast.error(`Type the ${kind.numberLabel.toLowerCase()}`); return; }
    if (!paise) { toast.error('Type the amount in rupees, for example 1180.50'); return; }
    const body = {
      kind: f.kind, number: f.number.trim(), reference: f.kind === 'receipt' ? f.reference.trim() : '', amount_paise: paise, date: f.date, note: f.note.trim(),
    };
    setSaving(true);
    try {
      if (entry) await updateLedgerEntry(entry.id, body);
      else await createLedgerEntry({ ...body, company_id: companyId, ledger_guid: ledgerGuid });
      toast.success(entry ? 'Entry changed' : 'Entry added');
      onSaved(f.date);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Saving failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={entry ? 'Change entry' : 'Add an entry'}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-gray-500">{party}</p>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-1.5">What is it?</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <button key={k.key} type="button" aria-pressed={f.kind === k.key} onClick={() => set({ kind: k.key })}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${f.kind === k.key ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand'}`}>
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">{kind.numberLabel}</span>
            <input value={f.number} onChange={(e) => set({ number: e.target.value })} maxLength={60} className={`${inputCls} mt-1`}
              placeholder={kind.key === 'invoice' ? 'e.g. 607 or 607/RM/26-27' : ''} />
          </label>
          {kind.key === 'receipt' && (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Reference / UTR (optional)</span>
              <input value={f.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={80} className={`${inputCls} mt-1`} placeholder="As on the bank statement" />
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Amount (₹)</span>
            <input value={f.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1 tabular-nums`} placeholder="e.g. 1180.50" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Date</span>
            <input type="date" value={f.date} min={minDate} max={maxDate} onChange={(e) => set({ date: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Note (optional)</span>
          <input value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} className={`${inputCls} mt-1`} />
        </label>
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          {paise
            ? <>{kind.adds ? 'Adds' : 'Takes'} <strong>{formatRupees(paise)}</strong> {kind.adds ? 'to' : 'off'} what this party owes.</>
            : <>An {kind.adds ? 'invoice or debit note adds to' : 'credit note or receipt takes off'} what this party owes.</>}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{entry ? 'Save changes' : 'Add entry'}</Button>
        </div>
      </form>
    </Modal>
  );
}
