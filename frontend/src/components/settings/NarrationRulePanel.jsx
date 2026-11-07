import { useEffect, useState } from 'react';
import { Highlighter, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { HistoryButton } from '../shared/HistoryDrawer';
import { getNarrationRule, updateNarrationRule } from '../../api/settings.api';
import { formatDateTime, formatDay } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';

// The narration check: which Tally records need a narration, and from which
// date. Every screen that lists Tally records highlights the ones without. It
// starts at every voucher type from the start of RAMS's copy; whoever holds
// narration.settings can narrow it.
const inputCls = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';

export default function NarrationRulePanel() {
  const { can } = useAuth();
  const [rule, setRule] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNarrationRule()
      .then((r) => { if (!cancelled) setRule(r); })
      .catch(() => toast.error('Failed to load the narration check'));
    return () => { cancelled = true; };
  }, []);

  const open = () => setForm({
    types: rule.types || rule.base_types.map((t) => t.base_type),
    required_from: rule.required_from,
  });
  const toggle = (t) => setForm((f) => ({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.types.length) { toast.error('Choose at least one voucher type'); return; }
    setSaving(true);
    try {
      const all = form.types.length === rule.base_types.length;
      setRule(await updateNarrationRule({ types: all ? null : form.types, required_from: form.required_from }));
      setForm(null);
      toast.success('Narration check saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const required = rule ? rule.base_types.filter((t) => t.required) : [];
  const flagged = required.reduce((a, t) => a + t.without_from, 0);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-6" aria-labelledby="narration-check-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="narration-check-heading" className="font-semibold text-brand flex items-center gap-2"><Highlighter size={16} /> Narration check</h2>
          {rule ? (
            <>
              <p className="text-sm text-gray-700 mt-1">
                A Tally record without a narration is highlighted when it is{' '}
                <strong>{rule.types ? rule.types.join(', ') : 'any voucher type'}</strong>, dated from <strong>{formatDay(rule.required_from)}</strong>.
                {' '}Today that is <strong>{flagged.toLocaleString('en-IN')}</strong> record{flagged === 1 ? '' : 's'}.
              </p>
              <p className="text-xs text-gray-400 mt-1">{rule.updated_at ? `Last changed ${formatDateTime(rule.updated_at)} by ${rule.updated_by_name || '—'}.` : 'Not changed yet.'}</p>
            </>
          ) : <div className="h-4 w-80 bg-gray-100 rounded animate-pulse mt-2" />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <HistoryButton entityType="narration_settings" entityId={1} title="History — Narration check" />
          {can(PERM.NARRATION_SETTINGS) && (
            <Button size="sm" variant="outline" disabled={!rule} onClick={open}><Pencil size={14} /> Edit</Button>
          )}
        </div>
      </div>

      {form && (
        <Modal isOpen onClose={() => setForm(null)} title="Narration check">
          <form onSubmit={save} className="space-y-4">
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-1">Highlight a missing narration on</legend>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500"><th className="py-1" /><th className="py-1">Voucher type</th><th className="py-1 text-right">Records</th><th className="py-1 text-right">Without a narration</th></tr>
                </thead>
                <tbody>
                  {rule.base_types.map((t) => (
                    <tr key={t.base_type} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2"><input type="checkbox" aria-label={t.base_type} className="w-4 h-4 accent-brand" checked={form.types.includes(t.base_type)} onChange={() => toggle(t.base_type)} /></td>
                      <td className="py-1.5">{t.base_type}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.total.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.without.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">From</span>
              <input type="date" aria-label="From" value={form.required_from} min={rule.sync_from} onChange={(e) => e.target.value && setForm((f) => ({ ...f, required_from: e.target.value }))} className={`${inputCls} mt-1 block`} />
              <span className="text-xs text-gray-500">Records dated before this still show their narration, but a missing one isn’t highlighted.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
