import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { createLedgerEntry, updateLedgerEntry } from '../../api/ledgers.api';
import { KINDS, KIND, paiseFrom } from '../../utils/ledgerText';
import { formatRupees } from '../../utils/formatters';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';
const blank = (date) => ({
  kind: 'debit_note', number: '', reference: '', amount: '', date, note: '',
});
const fromEntry = (e) => ({
  kind: e.kind, number: e.number || '', reference: e.reference || '', amount: (e.amount_paise / 100).toFixed(2), date: e.date, note: e.note || '',
});
// A marketplace DN number is found in Tally's narrations, so it needs enough
// letters and digits not to match a date there.
const MIN_DN = 6;

// Add or change one debit or credit note of a party: what it is, its number,
// the invoice it is against, the amount and the date. Mounted afresh for each
// entry (the parent keys it), so the form starts from that entry.
export default function EntryForm({
  party, companyId, ledgerGuid, date, entry, minDate, maxDate, onClose, onSaved,
}) {
  const [f, setF] = useState(() => (entry ? fromEntry(entry) : blank(date)));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const kind = KIND[f.kind] || KINDS[0];
  const paise = paiseFrom(f.amount);

  const save = async (e) => {
    e.preventDefault();
    const number = f.number.trim();
    if (!number) { toast.error(`Type the ${kind.numberLabel.toLowerCase()}`); return; }
    if (kind.key === 'debit_note' && number.replace(/[^A-Za-z0-9]/g, '').length < MIN_DN) {
      toast.error(`A DN number has at least ${MIN_DN} letters and digits, for example FKIDN51463346`);
      return;
    }
    if (!paise) { toast.error('Type the amount in rupees, for example 1180.50'); return; }
    const body = {
      kind: f.kind, number, reference: f.reference.trim(), amount_paise: paise, date: f.date, note: f.note.trim(),
    };
    setSaving(true);
    try {
      if (entry) await updateLedgerEntry(entry.id, body);
      else await createLedgerEntry({ ...body, company_id: companyId, ledger_guid: ledgerGuid });
      toast.success(entry ? 'Note changed' : 'Note added');
      onSaved(f.date);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Saving failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={entry ? 'Change a DN or CN' : 'Add a DN or CN'}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-gray-500">{party}</p>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-1.5">What is it?</legend>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k.key} type="button" aria-pressed={f.kind === k.key} onClick={() => set({ kind: k.key })}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${f.kind === k.key ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-200 hover:border-brand'}`}>
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {kind.key === 'debit_note'
              ? 'A debit note the marketplace raised on us, for example for a shortage or a return. In Tally it is booked as a credit note with this number in the narration.'
              : 'A credit note we issued, for example a monthly discount or a quantity difference. Type Tally’s credit note number.'}
          </p>
        </fieldset>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">{kind.numberLabel}</span>
            <input value={f.number} onChange={(e) => set({ number: e.target.value })} maxLength={60} className={`${inputCls} mt-1`} placeholder={kind.placeholder} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Against invoice (optional)</span>
            <input value={f.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={80} className={`${inputCls} mt-1`} placeholder="e.g. 556/RM/26-27" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Amount (₹)</span>
            <input value={f.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1 tabular-nums`} placeholder="e.g. 1180.50" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">{kind.key === 'debit_note' ? 'Date on the DN' : 'Date'}</span>
            <input type="date" value={f.date} min={minDate} max={maxDate} onChange={(e) => set({ date: e.target.value })} className={`${inputCls} mt-1`} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Note (optional)</span>
          <input value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} className={`${inputCls} mt-1`} />
        </label>
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          {paise
            ? <>Takes <strong>{formatRupees(paise)}</strong> off what this party owes.</>
            : <>A {kind.long} takes off what this party owes.</>}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{entry ? 'Save changes' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}
