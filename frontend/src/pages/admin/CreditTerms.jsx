import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import HelpLink from '../../components/shared/HelpLink';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { HistoryButton } from '../../components/shared/HistoryDrawer';
import {
  getReportSettings, updateReportSettings, updateTerms, previewTerms,
} from '../../api/reports.api';
import { formatDay, formatDateTime, formatRupees } from '../../utils/formatters';

// Admin -> Credit terms (reports.settings: Admin, Owner and Accountants to
// start): how many days each marketplace has to pay an invoice. Debtors marks
// an invoice overdue once they have passed. Each change is previewed before it
// is saved, and audited.
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const plusDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const r0 = (p) => formatRupees(p, { decimals: 0 });
const inputCls = 'w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/30';

// What the change would do, in a sentence.
function PreviewText({ p, vendor }) {
  if (!p) return <p className="text-sm text-gray-400">Working out what this changes…</p>;
  const whose = vendor ? `${vendor}’s` : 'the marketplaces on the default’s';
  if (!p.open_invoices) return <p className="text-sm text-gray-600">No invoice of {whose} is still owed, so nothing changes today.</p>;
  const parts = [];
  if (p.become_overdue) parts.push(`${p.become_overdue} would become overdue (${r0(p.become_overdue_paise)})`);
  if (p.stop_overdue) parts.push(`${p.stop_overdue} would stop being overdue (${r0(p.stop_overdue_paise)})`);
  return (
    <p className="text-sm text-gray-700">
      Of {whose} {p.open_invoices} invoices still owed, {p.overdue_now} are overdue now.{' '}
      {parts.length ? <strong>{parts.join(', and ')}.</strong> : 'No invoice would change.'}
    </p>
  );
}

// Edits one marketplace's days, or the default (vendor null).
function TermEditor({
  vendor, current, fallback, onClose, onSaved,
}) {
  const [days, setDays] = useState(current == null ? '' : String(current));
  const [useDefault, setUseDefault] = useState(Boolean(vendor) && current == null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const value = useDefault ? null : Number(days);
  const valid = useDefault || (days.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 365);

  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      previewTerms(vendor, value).then((p) => { if (alive) setPreview(p); }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [vendor, value, valid]);

  const save = async (e) => {
    e.preventDefault();
    if (!valid) { toast.error('Credit days must be a whole number, 0-365'); return; }
    setSaving(true);
    try {
      if (vendor) await updateTerms(vendor, value);
      else await updateReportSettings({ default_credit_days: value });
      toast.success(vendor ? `${vendor}: ${value == null ? `the default (${fallback} days)` : `${value} days`}` : `Default: ${value} days`);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Saving failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={vendor ? `Credit days — ${vendor}` : 'Default credit days'}>
      <form onSubmit={save} className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input aria-label="Credit days" value={useDefault ? '' : days} disabled={useDefault} onChange={(e) => { setDays(e.target.value); setPreview(null); }}
            inputMode="numeric" className={`${inputCls} disabled:bg-gray-50`} placeholder={useDefault ? String(fallback) : ''} />
          days
        </label>
        {vendor && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="w-4 h-4 accent-brand" checked={useDefault} onChange={(e) => { setUseDefault(e.target.checked); setPreview(null); }} />
            Use the default ({fallback} days)
          </label>
        )}
        {!vendor && <p className="text-xs text-gray-500">For every marketplace without its own days, and invoices whose marketplace isn’t known.</p>}
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          {valid ? <PreviewText p={preview} vendor={vendor} /> : <p className="text-sm text-gray-500">Type a whole number of days, 0-365.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!valid}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CreditTerms() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // { vendor, current } -- vendor null is the default
  const load = () => getReportSettings().then(setData).catch(() => toast.error('Failed to load the credit terms'));
  useEffect(() => { load(); }, []);
  const today = todayIst();
  const fallback = data?.settings.default_credit_days;
  const terms = (data?.terms || []).filter((t) => !t.transfer);
  const transfers = (data?.terms || []).filter((t) => t.transfer).map((t) => t.vendor);

  return (
    <AppShell>
      <div className="mb-6 max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">Credit terms</h1>
          <HelpLink section="credit-terms" />
        </div>
        <p className="text-gray-500 text-sm mt-1">How many days each marketplace has to pay an invoice. Debtors marks an invoice overdue once they have passed. Each change shows what it does before you save it, and is kept in the audit log.</p>
      </div>

      {!data ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          <section aria-label="Default credit days" className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Default: {fallback} days</p>
              <p className="text-xs text-gray-500">For every marketplace below that has no days of its own.</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing({ vendor: null, current: fallback })}><Pencil size={14} /> Edit</Button>
              <HistoryButton entityType="report_settings" entityId={1} title="History — default credit days" />
            </div>
          </section>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Marketplace</th>
                  <th className="px-4 py-3">Credit days</th>
                  <th className="px-4 py-3">An invoice dated today is due</th>
                  <th className="px-4 py-3">Last changed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => {
                  const days = t.credit_days ?? fallback;
                  return (
                    <tr key={t.vendor} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.vendor}</td>
                      <td className="px-4 py-3 tabular-nums">{t.credit_days == null ? <span className="text-gray-500">Default ({fallback})</span> : `${t.credit_days} days`}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDay(plusDays(today, days))}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.updated_at ? `${t.updated_by_name || 'someone'}, ${formatDateTime(t.updated_at)}` : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" aria-label={`Edit ${t.vendor}`} onClick={() => setEditing({ vendor: t.vendor, current: t.credit_days })} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {transfers.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{transfers.join(' and ')} {transfers.length > 1 ? 'are' : 'is'} left out: {transfers.length > 1 ? 'they are' : 'it is'} set to stock transfer on Matching rules, so nothing is owed.</p>
          )}
        </>
      )}

      {editing && (
        <TermEditor
          vendor={editing.vendor}
          current={editing.current}
          fallback={fallback}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </AppShell>
  );
}
