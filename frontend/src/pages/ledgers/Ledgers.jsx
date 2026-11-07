import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings2 } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import HelpLink from '../../components/shared/HelpLink';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import MultiSelect from '../../components/ui/MultiSelect';
import { ReportTable, selectCls, td } from '../../components/reports/ReportFrame';
import StatementTable, { StateLine } from '../../components/ledgers/StatementTable';
import PartyDetail from '../../components/ledgers/PartyDetail';
import EntryForm from '../../components/ledgers/EntryForm';
import LedgerSettings from '../../components/ledgers/LedgerSettings';
import {
  getLedgerParties, getLedgerStatement, getLedgerParty, deleteLedgerEntry,
} from '../../api/ledgers.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDay, formatRupees } from '../../utils/formatters';
import { KIND } from '../../utils/ledgerText';

// Ledgers: the bill-to-bill statement. Choose a company, a marketplace, states
// and parties (nothing is chosen at first, and each has "All"), and a range.
// One row per party, every figure Tally's; a row opens the party's notes and
// vouchers. Debit and credit notes are typed here and checked against Tally.
// Nothing is written to Tally.
const DEFAULTS = {
  company: null, vendor: null, states: null, parties: null, from: '', to: '', open: null,
};
const statementOrNothing = (p) => (p.company_id && p.vendor && p.states && p.parties ? getLedgerStatement(p) : Promise.resolve(null));
const partyOrNothing = (p) => (p.ledger_guid ? getLedgerParty(p) : Promise.resolve(null));
const minusDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const keyOf = (p) => `${p.company_id}:${p.guid}`;
const COUNT_WORDS = {
  missing: 'not in Tally', not_entered: 'in Tally, not entered here', amount_differs: 'amount differs', booked_twice: 'DN booked twice',
};

function Field({ label, children }) {
  return (
    <label className="block text-sm min-w-0">
      <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Attention({ rows, total, onOpen }) {
  if (!rows?.length) {
    return <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">Nothing needs attention. Choose a company, a marketplace, states and parties to see their ledgers.</p>;
  }
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Needs attention <span className="text-gray-400 font-normal">— parties where something needs a person{total > rows.length ? ` (first ${rows.length} of ${total})` : ''}</span></h2>
      <ReportTable head={['Party', 'Marketplace', 'What is off', 'Since']}>
        {rows.map((a) => (
          <tr key={keyOf(a.party)} className="border-b border-gray-100 hover:bg-gray-50 align-top">
            <td className={td}>
              <button type="button" className="text-left text-brand hover:underline" onClick={() => onOpen(a)}>{a.party.name}</button>
              <p className="text-xs text-gray-500">{a.party.company} · <StateLine party={a.party} /></p>
            </td>
            <td className={td}>{a.party.vendor}</td>
            <td className={td}>{Object.entries(a.counts).filter(([, c]) => c).map(([k, c]) => `${c} ${COUNT_WORDS[k]}`).join(' · ') || (a.state_differs ? 'The state in Tally and the GSTIN differ' : '')}</td>
            <td className={`${td} whitespace-nowrap`}>{a.since ? formatDay(a.since) : '—'}</td>
          </tr>
        ))}
      </ReportTable>
    </section>
  );
}

export default function Ledgers() {
  const { can } = useAuth();
  const [pick, setPick] = useSessionState('ledgers.filters', DEFAULTS);
  const [editing, setEditing] = useState(null); // 'new' or an entry
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const parties = useKeyedLoad(getLedgerParties, {});
  const p = parties.last;
  const today = p?.today || '';
  const from = pick.from || p?.month_start || '';
  const to = pick.to || today;

  const companies = p?.companies || [];
  const all = p?.parties || [];
  const inCompany = all.filter((x) => pick.company === 'all' || String(x.company_id) === pick.company);
  const billToBill = (p?.marketplaces || []).filter((m) => m.bill_to_bill);
  const comingSoon = (p?.marketplaces || []).filter((m) => !m.bill_to_bill);
  const soon = comingSoon.find((m) => m.vendor === pick.vendor);
  const inVendor = inCompany.filter((x) => pick.vendor === 'all' || x.vendor === pick.vendor);
  const stateCounts = new Map();
  for (const x of inVendor) for (const s of new Set([x.tally_state, x.gst_state].filter(Boolean))) stateCounts.set(s, (stateCounts.get(s) || 0) + 1);
  const stateOptions = [...stateCounts].sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => ({ value: s, label: s, hint: String(n) }));
  const inStates = inVendor.filter((x) => pick.states === 'all' || (Array.isArray(pick.states) && [x.tally_state, x.gst_state].some((s) => s && pick.states.includes(s))));
  const partyOptions = inStates.map((x) => ({ value: keyOf(x), label: pick.company === 'all' ? `${x.name} (${x.company})` : x.name, hint: x.state || '' }));

  const ready = pick.company && pick.vendor && !soon && pick.states && pick.parties && from && to;
  const statement = useKeyedLoad(statementOrNothing, ready ? {
    company_id: pick.company, vendor: pick.vendor, states: pick.states, parties: pick.parties, from: pick.from, to: pick.to,
  } : {});
  const rows = statement.data?.rows || [];
  // A single party opens by itself, unless it was closed ('none').
  const openKey = pick.open === 'none' ? null : pick.open || (rows.length === 1 ? keyOf(rows[0].party) : null);
  const [openCompany, openGuid] = openKey ? openKey.split(':') : [];
  const detail = useKeyedLoad(partyOrNothing, ready && openKey ? {
    company_id: openCompany, ledger_guid: openGuid, from: pick.from, to: pick.to,
  } : {});
  const day = detail.data;
  const canEnter = can(PERM.LEDGERS_ENTRY);

  const set = (patch) => setPick((x) => ({ ...x, ...patch }));
  const setCompany = (v) => set({
    company: v || null, vendor: null, states: null, parties: null, open: null,
  });
  const setVendor = (v) => set({
    vendor: v || null, states: null, parties: null, open: null,
  });
  // Ticked parties that the new states leave out are dropped.
  const setStates = (states) => {
    const keep = (x) => states === 'all' || (Array.isArray(states) && [x.tally_state, x.gst_state].some((s) => s && states.includes(s)));
    const still = new Set(inVendor.filter(keep).map(keyOf));
    const partiesNow = Array.isArray(pick.parties) ? pick.parties.filter((k) => still.has(k)) : pick.parties;
    set({ states, parties: states && (partiesNow === 'all' || partiesNow?.length) ? partiesNow : null, open: null });
  };
  const reload = () => { parties.reload(); statement.reload(); detail.reload(); };
  // From the oldest problem (or the copy's start) to today.
  const openAttention = (a) => set({
    company: String(a.party.company_id),
    vendor: a.party.vendor,
    states: 'all',
    parties: [keyOf(a.party)],
    from: a.since ? (a.since < p.sync_from ? p.sync_from : a.since) : '',
    to: '',
    open: keyOf(a.party),
  });

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLedgerEntry(removing.id);
      toast.success('Note removed');
      setRemoving(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Removing failed');
    } finally { setBusy(false); }
  };

  const noParty = p && pick.company && !inCompany.length;

  return (
    <AppShell>
      <div className="mb-4 max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">Ledgers</h1>
          <HelpLink section="ledgers" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          The bill-to-bill statement per party: Tally’s opening, invoices, debit and credit notes, TDS, journals, receipts and closing. Debit and credit notes are also typed here and checked against Tally. RAMS never writes to Tally.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1.3fr)_minmax(10rem,1.3fr)_minmax(14rem,2fr)_auto] items-end">
        <Field label="Company">
          <select aria-label="Company" value={pick.company || ''} onChange={(e) => setCompany(e.target.value)} className={`${selectCls} w-full`}>
            <option value="">Choose a company</option>
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.code || c.name}</option>)}
          </select>
        </Field>
        <Field label="Marketplace">
          <select aria-label="Marketplace" value={pick.vendor || ''} disabled={!pick.company} onChange={(e) => setVendor(e.target.value)} className={`${selectCls} w-full disabled:bg-gray-50`}>
            <option value="">Choose a marketplace</option>
            {billToBill.length > 0 && <option value="all">All ({billToBill.map((m) => m.vendor).join(', ')})</option>}
            {billToBill.map((m) => (
              <option key={m.vendor} value={m.vendor}>{m.vendor} ({inCompany.filter((x) => x.vendor === m.vendor).length})</option>
            ))}
            {comingSoon.map((m) => <option key={m.vendor} value={m.vendor}>{m.vendor} — coming soon</option>)}
          </select>
        </Field>
        <Field label="State">
          <MultiSelect label="State" options={stateOptions} value={pick.states} onChange={setStates} placeholder="Choose states" allLabel="All states" noun="states"
            disabled={!pick.vendor || Boolean(soon)} />
        </Field>
        <Field label="Party">
          <MultiSelect label="Party" options={partyOptions} value={pick.parties} onChange={(v) => set({ parties: v, open: null })} placeholder="Choose parties" allLabel="All parties" noun="parties"
            disabled={!pick.states || Boolean(soon)} />
        </Field>
        <Field label="Dates">
          <div className="flex items-center gap-1">
            <input type="date" aria-label="From" value={from} min={p?.sync_from} max={to || today} onChange={(e) => e.target.value && set({ from: e.target.value })} className={selectCls} />
            <span className="text-gray-400">to</span>
            <input type="date" aria-label="To" value={to} min={from || p?.sync_from} max={today} onChange={(e) => e.target.value && set({ to: e.target.value })} className={selectCls} />
            {(pick.from || pick.to) && <Button size="sm" variant="ghost" onClick={() => set({ from: '', to: '' })}>This month</Button>}
          </div>
        </Field>
      </div>

      {noParty && (
        <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center mb-4">
          No party ledger here is mapped to {billToBill.map((m) => m.vendor).join(', ') || 'a bill-to-bill marketplace'} yet.{' '}
          {can(PERM.MATCHING_VIEW) ? <>Map them on <Link to="/matching/parties" className="text-brand hover:underline">Matching → Party ledgers</Link>.</> : 'Ask an Accountant or Admin to map them on Matching → Party ledgers.'}
        </p>
      )}

      {soon && (
        <div role="status" className="text-sm text-gray-700 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center mb-4">
          <p className="font-semibold">Ledgers for {soon.vendor} is coming soon.</p>
          <p className="mt-1">For now Ledgers covers the marketplaces that pay bill to bill: {billToBill.map((m) => m.vendor).join(', ')}.</p>
        </div>
      )}

      {!ready && !soon && !noParty && <Attention rows={p?.attention} total={p?.attention_total} onOpen={openAttention} />}

      {ready && (
        <>
          <StatementTable data={statement.data} loading={statement.loading} selected={openKey} showCompany={pick.company === 'all'}
            onOpen={(r) => set({ open: keyOf(r.party) })} />
          {day && (
            <PartyDetail
              day={day}
              canEnter={canEnter}
              onAdd={() => setEditing('new')}
              onEdit={setEditing}
              onRemove={setRemoving}
              onClose={() => set({ open: 'none' })}
            />
          )}
        </>
      )}

      {can(PERM.LEDGERS_SETTINGS) && (
        <div className="flex justify-end mt-4">
          <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> Ledger settings</Button>
        </div>
      )}

      {editing && day && (
        <EntryForm
          key={editing === 'new' ? 'new' : editing.id}
          party={day.party.name}
          companyId={day.party.company_id}
          ledgerGuid={day.party.guid}
          date={day.to}
          entry={editing === 'new' ? null : editing}
          minDate={minusDays(day.sync_from, 365)}
          maxDate={day.today}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="Remove this note?"
        message={removing ? `${KIND[removing.kind]?.label} ${removing.number} for ${formatRupees(removing.amount_paise)}, dated ${formatDay(removing.date)}. It stays in the audit log.` : ''}
        confirmLabel="Remove"
      />
      {settingsOpen && <LedgerSettings syncFrom={p?.sync_from} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); reload(); }} />}
    </AppShell>
  );
}
