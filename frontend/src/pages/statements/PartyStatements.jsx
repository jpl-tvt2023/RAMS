import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, ChevronDown } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import HelpLink from '../../components/shared/HelpLink';
import Button from '../../components/ui/Button';
import MultiSelect from '../../components/ui/MultiSelect';
import { ReportTable, selectCls, td } from '../../components/reports/ReportFrame';
import StatementTable, { StateLine } from '../../components/statements/StatementTable';
import PartyDetail from '../../components/statements/PartyDetail';
import StatementSettings from '../../components/statements/StatementSettings';
import FilesDialog from '../../components/files/FilesDialog';
import { getStatementParties, getStatement, getStatementParty } from '../../api/statements.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDay } from '../../utils/formatters';
import { FILTERS_KEY, DEFAULTS } from '../../utils/statementLinks';

// Party Statements (the page at /reports/party-statements, once called Ledgers): the bill-to-bill
// statement. It opens on the default company (the
// star on Admin -> Tally companies), every bill-to-bill marketplace, all states
// and all parties, this month; narrow it with the filters. One row per party, every figure Tally's; a row opens the party's Tally
// vouchers. Nothing is typed here: a credit note whose narration names a
// marketplace DN is in the DN column. Any row can carry files (the invoice,
// the DN's PDF, a photo, the email), and a row without one is highlighted.
// Nothing is written to Tally. What is chosen (FILTERS_KEY, DEFAULTS) is in
// utils/statementLinks.js.
const statementOrNothing = (p) => (p.company_id && p.vendor && p.states && p.parties ? getStatement(p) : Promise.resolve(null));
const partyOrNothing = (p) => (p.ledger_guid ? getStatementParty(p) : Promise.resolve(null));
const keyOf = (p) => `${p.company_id}:${p.guid}`;
const COUNT_WORDS = { booked_twice: 'DN booked twice', no_file: 'without a file' };
// The statement and Needs attention scroll inside their box past about eight
// rows, so a party's detail opens close to the list.
const LIST_HEIGHT = 'max-h-[45vh]';

function Field({ label, children }) {
  return (
    <label className="block text-sm min-w-0">
      <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Every bill-to-bill party with something for a person, in every company --
// opened from the "Needs attention" button.
function Attention({ rows, total, onOpen }) {
  return (
    <section aria-label="Needs attention" className="mb-4">
      <p className="text-xs text-gray-500 mb-2">Parties where something needs a person, since 8 June 2026. Click one to see it{total > rows.length ? ` (first ${rows.length} of ${total})` : ''}.</p>
      <ReportTable head={['Party', 'Marketplace', 'What is off', 'Since']} maxHeight={LIST_HEIGHT}>
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

export default function PartyStatements() {
  const { can } = useAuth();
  const [pick, setPick] = useSessionState(FILTERS_KEY, DEFAULTS);
  const [filesOf, setFilesOf] = useState(null); // { voucherGuid }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const detailRef = useRef(null);
  const scrollPending = useRef(false);
  const parties = useKeyedLoad(getStatementParties, {});
  const p = parties.last;
  const today = p?.today || '';
  const from = pick.from || p?.month_start || '';
  const to = pick.to || today;

  const companies = p?.companies || [];
  // 'default' is the starred company, or All companies when none is starred.
  const starred = companies.find((c) => c.is_default);
  let company = pick.company;
  if (company === 'default') company = p ? (starred ? String(starred.id) : 'all') : null;
  const all = p?.parties || [];
  const inCompany = all.filter((x) => company === 'all' || String(x.company_id) === company);
  const billToBill = (p?.marketplaces || []).filter((m) => m.bill_to_bill);
  const comingSoon = (p?.marketplaces || []).filter((m) => !m.bill_to_bill);
  const soon = comingSoon.find((m) => m.vendor === pick.vendor);
  const inVendor = inCompany.filter((x) => pick.vendor === 'all' || x.vendor === pick.vendor);
  const stateCounts = new Map();
  for (const x of inVendor) for (const s of new Set([x.tally_state, x.gst_state].filter(Boolean))) stateCounts.set(s, (stateCounts.get(s) || 0) + 1);
  const stateOptions = [...stateCounts].sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => ({ value: s, label: s, hint: String(n) }));
  const inStates = inVendor.filter((x) => pick.states === 'all' || (Array.isArray(pick.states) && [x.tally_state, x.gst_state].some((s) => s && pick.states.includes(s))));
  const partyOptions = inStates.map((x) => ({ value: keyOf(x), label: company === 'all' ? `${x.name} (${x.company})` : x.name, hint: x.state || '' }));

  const ready = company && pick.vendor && !soon && pick.states && pick.parties && from && to;
  const statement = useKeyedLoad(statementOrNothing, ready ? {
    company_id: company, vendor: pick.vendor, states: pick.states, parties: pick.parties, from: pick.from, to: pick.to,
  } : {});
  const rows = statement.data?.rows || [];
  // A single party opens by itself, unless it was closed ('none').
  const openKey = pick.open === 'none' ? null : pick.open || (rows.length === 1 ? keyOf(rows[0].party) : null);
  const [openCompany, openGuid] = openKey ? openKey.split(':') : [];
  const detail = useKeyedLoad(partyOrNothing, ready && openKey ? {
    company_id: openCompany, ledger_guid: openGuid, from: pick.from, to: pick.to,
  } : {});
  const day = detail.data;
  const canFiles = can(PERM.STATEMENTS_FILES);

  // The row whose files are open, from the party as last loaded.
  const filesRow = day && filesOf ? day.vouchers.find((v) => v.guid === filesOf.voucherGuid) : null;

  const set = (patch) => setPick((x) => ({ ...x, ...patch }));
  // A new choice resets the filters after it to All.
  const setCompany = (v) => set({
    company: v, vendor: 'all', states: 'all', parties: 'all', open: null, nofile: false,
  });
  const setVendor = (v) => set({
    vendor: v, states: 'all', parties: 'all', open: null, nofile: false,
  });
  // Ticked parties that the new states leave out are dropped; with none left
  // (or none ticked) it is All parties again.
  const setStates = (states) => {
    const keep = (x) => states === 'all' || (Array.isArray(states) && [x.tally_state, x.gst_state].some((s) => s && states.includes(s)));
    const still = new Set(inVendor.filter(keep).map(keyOf));
    const partiesNow = Array.isArray(pick.parties) ? pick.parties.filter((k) => still.has(k)) : pick.parties;
    let partiesNext = null;
    if (states) partiesNext = partiesNow === 'all' || partiesNow?.length ? partiesNow : 'all';
    set({ states, parties: partiesNext, open: null });
  };
  // A party clicked in the statement: its detail is brought into view once it
  // has loaded (at once, when it is the one already open).
  const openParty = (r) => {
    const key = keyOf(r.party);
    if (key === openKey && day) detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    else scrollPending.current = true;
    set({ open: key, nofile: false });
  };
  useEffect(() => {
    if (!day || !scrollPending.current) return;
    scrollPending.current = false;
    detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [day]);
  const reload = () => { parties.reload(); statement.reload(); detail.reload(); };
  // From the oldest problem (or the copy's start) to today. When the only
  // thing off is rows without a file, just those are shown.
  const openAttention = (a) => {
    setAttentionOpen(false);
    set({
      company: String(a.party.company_id),
      vendor: a.party.vendor,
      states: 'all',
      parties: [keyOf(a.party)],
      from: a.since ? (a.since < p.sync_from ? p.sync_from : a.since) : '',
      to: '',
      open: keyOf(a.party),
      nofile: Boolean(a.counts.no_file) && !a.state_differs && Object.entries(a.counts).every(([k, c]) => k === 'no_file' || !c),
    });
  };

  const noParty = p && company && !inCompany.length;
  const attentionTotal = p?.attention_total || 0;

  return (
    <AppShell>
      <div className="mb-4 max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">Party Statements</h1>
          <HelpLink section="party-statements" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          The bill-to-bill statement per party, all from Tally: opening, invoices, debit and credit notes, TDS, journals, receipts and closing. Nothing is typed here. Attach each row’s document (PDF, photo or email); a row without one is orange. RAMS never writes to Tally.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1.3fr)_minmax(10rem,1.3fr)_minmax(14rem,2fr)_auto] items-end">
        <Field label="Company">
          <select aria-label="Company" value={company || ''} onChange={(e) => setCompany(e.target.value)} className={`${selectCls} w-full`}>
            {!p && <option value="">Loading…</option>}
            <option value="all">All companies</option>
            {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.code || c.name}</option>)}
          </select>
        </Field>
        <Field label="Marketplace">
          <select aria-label="Marketplace" value={pick.vendor || ''} disabled={!company} onChange={(e) => setVendor(e.target.value)} className={`${selectCls} w-full disabled:bg-gray-50`}>
            {!billToBill.length && <option value="">Choose a marketplace</option>}
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
          <MultiSelect label="Party" options={partyOptions} value={pick.parties} onChange={(v) => set({ parties: v, open: null, nofile: false })} placeholder="Choose parties" allLabel="All parties" noun="parties"
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
          <p className="font-semibold">Party Statements for {soon.vendor} is coming soon.</p>
          <p className="mt-1">For now Party Statements covers the marketplaces that pay bill to bill: {billToBill.map((m) => m.vendor).join(', ')}.</p>
        </div>
      )}

      {attentionTotal > 0 && (
        <div className="flex justify-end mb-2">
          <Button size="sm" variant="outline" aria-expanded={attentionOpen} onClick={() => setAttentionOpen((o) => !o)}>
            Needs attention ({attentionTotal})
            <ChevronDown size={14} className={`transition-transform ${attentionOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      )}
      {attentionOpen && attentionTotal > 0 && <Attention rows={p.attention} total={attentionTotal} onOpen={openAttention} />}

      {p && !ready && !soon && !noParty && (
        <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">Choose at least one state and one party.</p>
      )}

      {ready && (
        <>
          <StatementTable data={statement.data} loading={statement.loading} selected={openKey} showCompany={company === 'all'}
            maxHeight={LIST_HEIGHT} onOpen={openParty} />
          {day && (
            <div ref={detailRef} className="scroll-mt-4">
              <PartyDetail
                day={day}
                canFiles={canFiles}
                onlyNoFile={Boolean(pick.nofile)}
                onToggleNoFile={(v) => set({ nofile: v })}
                onFiles={setFilesOf}
                onClose={() => set({ open: 'none', nofile: false })}
              />
            </div>
          )}
        </>
      )}

      {can(PERM.STATEMENTS_SETTINGS) && (
        <div className="flex justify-end mt-4">
          <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> Statement settings</Button>
        </div>
      )}

      {filesRow && (
        <FilesDialog
          key={filesOf.voucherGuid}
          title={`${filesRow.voucher_type} ${filesRow.number || ''}`.trim()}
          subtitle={`${day.party.name} · ${formatDay(filesRow.date)}`}
          files={filesRow.files || []}
          target={{ companyId: day.party.company_id, voucherGuid: filesOf.voucherGuid }}
          canEdit={canFiles}
          onClose={() => setFilesOf(null)}
          onChanged={reload}
        />
      )}
      {settingsOpen && <StatementSettings syncFrom={p?.sync_from} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); reload(); }} />}
    </AppShell>
  );
}
