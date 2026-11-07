import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getLedgerSettings, updateLedgerSettings } from '../../api/ledgers.api';
import { paiseFrom } from '../../utils/ledgerText';
import { formatDateTime, formatDay } from '../../utils/formatters';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand tabular-nums';
const rupeesText = (p) => (p / 100).toFixed(2);
const wholeIn = (text, min, max) => {
  const v = Number(text);
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
};

// Ledger settings, for whoever holds ledgers.settings: which marketplaces
// Ledgers covers, how long Tally may take to book a note, how long a Tally
// credit note may wait to be typed here, the amount tolerance and the
// placeholder opening.
export default function LedgerSettings({ syncFrom, onClose, onSaved }) {
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((x) => ({ ...x, ...patch }));

  useEffect(() => {
    getLedgerSettings()
      .then((d) => {
        setS(d);
        setForm({
          marketplaces: d.marketplaces,
          window: String(d.match_window_days),
          grace: String(d.grace_days),
          tolerance: rupeesText(d.amount_tolerance_paise),
          opening: rupeesText(d.default_opening_paise),
        });
      })
      .catch(() => toast.error('Failed to load the settings'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const window = wholeIn(form.window, 1, 365);
    const grace = wholeIn(form.grace, 0, 90);
    const tolerance = paiseFrom(form.tolerance);
    const opening = paiseFrom(form.opening);
    if (window == null) { toast.error('Days Tally may take must be 1-365'); return; }
    if (grace == null) { toast.error('Days to type a note must be 0-90'); return; }
    if (tolerance == null) { toast.error('Type the tolerance in rupees, for example 1'); return; }
    if (opening == null) { toast.error('Type the placeholder opening in rupees, for example 10000'); return; }
    setSaving(true);
    try {
      await updateLedgerSettings({
        marketplaces: form.marketplaces, match_window_days: window, grace_days: grace, amount_tolerance_paise: tolerance, default_opening_paise: opening,
      });
      toast.success('Settings saved');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Saving failed');
    } finally { setSaving(false); }
  };

  const toggle = (v) => set({ marketplaces: form.marketplaces.includes(v) ? form.marketplaces.filter((x) => x !== v) : [...form.marketplaces, v] });

  return (
    <Modal isOpen onClose={onClose} title="Ledger settings">
      {!form ? <p className="text-sm text-gray-400 py-6 text-center">Loading…</p> : (
        <form onSubmit={save} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Marketplaces on Ledgers (pay bill to bill)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {s.known_marketplaces.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="w-4 h-4 accent-brand" checked={form.marketplaces.includes(v)} onChange={() => toggle(v)} />
                  {v}
                </label>
              ))}
            </div>
            <span className="text-xs text-gray-500">The others show “coming soon” on Ledgers.</span>
          </fieldset>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Days Tally may take to book a DN or CN</span>
            <input aria-label="Days Tally may take" value={form.window} onChange={(e) => set({ window: e.target.value })} inputMode="numeric" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">A note typed here shows “Not in Tally yet” this long, then “Not in Tally”. A DN found by its amount must be booked within it.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Days to type a note that’s in Tally</span>
            <input aria-label="Days to type a note" value={form.grace} onChange={(e) => set({ grace: e.target.value })} inputMode="numeric" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">A credit note in Tally shows “Not entered here yet” this long, then “Not entered here”.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Amount tolerance (₹)</span>
            <input aria-label="Amount tolerance" value={form.tolerance} onChange={(e) => set({ tolerance: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">Amounts this close to Tally’s count as the same, for rounding.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Placeholder opening (₹)</span>
            <input aria-label="Placeholder opening" value={form.opening} onChange={(e) => set({ opening: e.target.value })} inputMode="decimal" className={`${inputCls} mt-1`} />
            <span className="text-xs text-gray-500">Used only when the last sync couldn’t read a party’s balance from Tally: the party then starts on this on {formatDay(syncFrom)}, and Tally’s vouchers since carry it forward.</span>
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
