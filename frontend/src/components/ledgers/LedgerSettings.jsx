import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getLedgerSettings, updateLedgerSettings } from '../../api/ledgers.api';
import { paiseFrom } from '../../utils/ledgerText';
import { formatDateTime, formatDay } from '../../utils/formatters';

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand tabular-nums';
const rupeesText = (p) => (p / 100).toFixed(2);

// Ledger settings, for whoever holds ledgers.settings: which marketplaces
// Ledgers covers, and the placeholder opening. (Every row is Tally's, so
// nothing about typed notes is left to set.)
export default function LedgerSettings({ syncFrom, onClose, onSaved }) {
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((x) => ({ ...x, ...patch }));

  useEffect(() => {
    getLedgerSettings()
      .then((d) => {
        setS(d);
        setForm({ marketplaces: d.marketplaces, opening: rupeesText(d.default_opening_paise) });
      })
      .catch(() => toast.error('Failed to load the settings'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const opening = paiseFrom(form.opening);
    if (opening == null) { toast.error('Type the placeholder opening in rupees, for example 10000'); return; }
    setSaving(true);
    try {
      await updateLedgerSettings({ marketplaces: form.marketplaces, default_opening_paise: opening });
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
