import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getLedgerSettings, updateLedgerSettings } from '../../api/ledgers.api';
import { paiseFrom } from '../../utils/ledgerText';
import { formatDateTime, formatDay } from '../../utils/formatters';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand tabular-nums';
const rupeesText = (p) => (p / 100).toFixed(2);

// Ledger settings, for whoever holds ledgers.settings: how long either side
// may wait for the other, the amount tolerance, and the placeholder opening.
export default function LedgerSettings({ syncFrom, onClose, onSaved }) {
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLedgerSettings()
      .then((d) => {
        setS(d);
        setForm({ grace_days: String(d.grace_days), tolerance: rupeesText(d.amount_tolerance_paise), opening: rupeesText(d.default_opening_paise) });
      })
      .catch(() => toast.error('Failed to load the settings'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const grace = Number(form.grace_days);
    const tolerance = paiseFrom(form.tolerance);
    const opening = paiseFrom(form.opening);
    if (!Number.isInteger(grace) || grace < 0 || grace > 30) { toast.error('Days to wait must be 0-30'); return; }
    if (tolerance == null) { toast.error('Type the tolerance in rupees, for example 1'); return; }
    if (opening == null) { toast.error('Type the placeholder opening in rupees, for example 10000'); return; }
    setSaving(true);
    try {
      await updateLedgerSettings({ grace_days: grace, amount_tolerance_paise: tolerance, default_opening_paise: opening });
      toast.success('Settings saved');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Saving failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Ledger settings">
      {!form ? <p className="text-sm text-gray-400 py-6 text-center">Loading…</p> : (
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Days to wait</span>
            <input aria-label="Days to wait" value={form.grace_days} onChange={(e) => setForm({ ...form, grace_days: e.target.value })} inputMode="numeric" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">An entry not in Tally yet, or a Tally voucher not entered here yet, is flagged only after this many days.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Amount tolerance (₹)</span>
            <input aria-label="Amount tolerance" value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">Amounts this close to Tally’s count as the same, for rounding.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Placeholder opening (₹)</span>
            <input aria-label="Placeholder opening" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">A party whose real balance isn’t loaded yet starts on this on {formatDay(syncFrom)}. Tally’s vouchers since then carry it forward.</span>
          </label>
          {s?.updated_at && <p className="text-xs text-gray-400">Last changed by {s.updated_by_name || 'someone'} on {formatDateTime(s.updated_at)}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
