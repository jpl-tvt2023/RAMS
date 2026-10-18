import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Settings2,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import HelpLink from '../../components/shared/HelpLink';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { HistoryButton } from '../../components/shared/HistoryDrawer';
import {
  ReportTable, selectCls, td, num,
} from '../../components/reports/ReportFrame';
import EntryForm from '../../components/ledgers/EntryForm';
import LedgerSettings from '../../components/ledgers/LedgerSettings';
import { getLedgerParties, getLedgerDay, deleteLedgerEntry } from '../../api/ledgers.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDay, formatDateTime, formatRupees } from '../../utils/formatters';
import {
  KIND, entryStatus, tallyOnlyStatus, dayStatus, OPENING_SOURCE, balance,
} from '../../utils/ledgerText';

// Ledgers: pick a marketplace, then one of its party ledgers, then a day. The
// day opens on the party's balance, lists the invoices, debit notes, credit
// notes and receipts typed here, and checks each against Tally -- and Tally's
// vouchers nobody typed. Nothing is written to Tally.
const DEFAULTS = {
  company_id: 'default', vendor: '', ledger_guid: '', date: '',
};
const NOT_MAPPED = '-';
const dayOrNothing = (p) => (p.ledger_guid ? getLedgerDay(p) : Promise.resolve(null));
const shift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const BANNER = {
  green: 'bg-green-50 border-green-200 text-green-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
};
const COUNT_WORDS = {
  missing: 'not in Tally', amount_differs: 'amount differs', other_date: 'on another day', only_in_tally: 'only in Tally',
};
const signed = (effect) => (effect ? `${effect > 0 ? '+' : '−'}${formatRupees(Math.abs(effect))}` : formatRupees(0));

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
    return <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">Nothing needs attention. Choose a marketplace and a party to open its ledger.</p>;
  }
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Needs attention <span className="text-gray-400 font-normal">— days where RAMS and Tally differ{total > rows.length ? ` (latest ${rows.length} of ${total})` : ''}</span></h2>
      <ReportTable head={['Day', 'Party', 'Marketplace', 'What is off', { label: 'Difference', right: true }]}>
        {rows.map((a) => (
          <tr key={`${a.ledger_guid}|${a.date}`} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(a)}>
            <td className={`${td} whitespace-nowrap`}>{formatDay(a.date)}</td>
            <td className={td}><button type="button" className="text-left text-brand hover:underline" onClick={() => onOpen(a)}>{a.party}</button></td>
            <td className={td}>{a.vendor || <span className="text-gray-400">Not mapped</span>}</td>
            <td className={td}>{Object.entries(a.counts).filter(([, c]) => c).map(([k, c]) => `${c} ${COUNT_WORDS[k]}`).join(' · ')}</td>
            <td className={num}>{formatRupees(Math.abs(a.difference_paise))}</td>
          </tr>
        ))}
      </ReportTable>
    </section>
  );
}

function Summary({ day }) {
  const src = OPENING_SOURCE[day.start.source] || OPENING_SOURCE.placeholder;
  const card = 'bg-white rounded-xl border border-gray-200 px-4 py-3';
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
      <div className={card}>
        <p className="text-xs text-gray-500">Opening on {formatDay(day.date)}</p>
        <p className="text-lg font-semibold tabular-nums">{balance(day.opening_paise)}</p>
        <Badge color={src.color} className="mt-1">{src.label}</Badge>
        {day.start.source === 'placeholder' && (
          <p className="text-xs text-gray-500 mt-1">{formatRupees(day.start.paise, { decimals: 0 })} on {formatDay(day.sync_from)}, carried forward by Tally’s vouchers since.</p>
        )}
      </div>
      <div className={card}>
        <p className="text-xs text-gray-500">Closing by RAMS</p>
        <p className="text-lg font-semibold tabular-nums">{balance(day.rams_closing_paise)}</p>
        <p className="text-xs text-gray-500">Opening {signed(day.rams_moves_paise || 0)} entered here</p>
      </div>
      <div className={card}>
        <p className="text-xs text-gray-500">Closing in Tally</p>
        <p className="text-lg font-semibold tabular-nums">{balance(day.tally_closing_paise)}</p>
        <p className="text-xs text-gray-500">Opening {signed(day.tally_moves_paise || 0)} in Tally</p>
      </div>
      <div className={card}>
        <p className="text-xs text-gray-500">Difference</p>
        <p className={`text-lg font-semibold tabular-nums ${day.difference_paise ? 'text-danger' : 'text-green-700'}`}>{formatRupees(Math.abs(day.difference_paise))}</p>
        <p className="text-xs text-gray-500">{day.difference_paise > 0 ? 'RAMS is higher' : day.difference_paise < 0 ? 'RAMS is lower' : 'The closings agree'}</p>
      </div>
    </div>
  );
}

export default function Ledgers() {
  const { can } = useAuth();
  const [pick, setPick] = useSessionState('ledgers.pick', DEFAULTS);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // 'new' or an entry
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const parties = useKeyedLoad(getLedgerParties, { company_id: pick.company_id });
  const dayLoad = useKeyedLoad(dayOrNothing, { company_id: pick.company_id, ledger_guid: pick.ledger_guid, date: pick.date });

  const p = parties.last;
  const today = p?.today || '';
  const date = pick.date || today;
  const companyId = pick.company_id === 'default' ? String(p?.company_id ?? '') : pick.company_id;
  const vendors = p?.vendors || [];
  const vendor = vendors.find((v) => (v.vendor ?? NOT_MAPPED) === pick.vendor);
  const words = filter.trim().toLowerCase();
  const partyList = (vendor?.parties || []).filter((x) => !words || x.guid === pick.ledger_guid || x.name.toLowerCase().includes(words));
  const day = dayLoad.data;
  const canEnter = can(PERM.LEDGERS_ENTRY);

  const set = (patch) => setPick((x) => ({ ...x, ...patch }));
  const reload = () => { parties.reload(); dayLoad.reload(); };
  const open = (a) => set({ vendor: a.vendor ?? NOT_MAPPED, ledger_guid: a.ledger_guid, date: a.date });

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLedgerEntry(removing.id);
      toast.success('Entry removed');
      setRemoving(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Removing failed');
    } finally { setBusy(false); }
  };

  const status = day && dayStatus(day);

  return (
    <AppShell>
      <div className="mb-4 max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">Ledgers</h1>
          <HelpLink section="ledgers" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          A party’s day: its opening balance, the invoices, debit notes, credit notes and receipts entered here, and the closing — each checked against Tally. RAMS never writes to Tally.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 md:grid-cols-[minmax(6rem,auto)_minmax(10rem,1fr)_minmax(14rem,2fr)_auto] items-end">
        <Field label="Company">
          <select aria-label="Company" value={companyId} onChange={(e) => set({ company_id: e.target.value, vendor: '', ledger_guid: '' })} className={`${selectCls} w-full`}>
            {(p?.companies || []).map((c) => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
          </select>
        </Field>
        <Field label="Marketplace">
          <select aria-label="Marketplace" value={pick.vendor} onChange={(e) => { setFilter(''); set({ vendor: e.target.value, ledger_guid: '' }); }} className={`${selectCls} w-full`}>
            <option value="">Choose a marketplace</option>
            {vendors.map((v) => (
              <option key={v.vendor ?? NOT_MAPPED} value={v.vendor ?? NOT_MAPPED}>
                {v.vendor ?? 'Not mapped'} ({v.parties.length}){v.flagged_days ? ` · ${v.flagged_days} to check` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Party">
          <div className="flex gap-2">
            {vendor && vendor.parties.length > 8 && (
              <input aria-label="Filter parties" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="w-28 shrink-0 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            )}
            <select aria-label="Party" value={pick.ledger_guid} disabled={!vendor} onChange={(e) => set({ ledger_guid: e.target.value })} className={`${selectCls} w-full min-w-0 disabled:bg-gray-50`}>
              <option value="">{vendor ? 'Choose a party' : 'Choose a marketplace first'}</option>
              {partyList.map((x) => (
                <option key={x.guid} value={x.guid}>
                  {x.name}{x.suggested ? ' (suggested)' : ''}{x.flagged_days ? ` — ${x.flagged_days} day${x.flagged_days > 1 ? 's' : ''} to check` : ''}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Day">
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous day" disabled={!date || date <= p?.sync_from} onClick={() => set({ date: shift(date, -1) })} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <input type="date" aria-label="Day" value={date} min={p?.sync_from} max={today} onChange={(e) => e.target.value && set({ date: e.target.value })} className={selectCls} />
            <button type="button" aria-label="Next day" disabled={!date || date >= today} onClick={() => set({ date: shift(date, 1) })} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            {date !== today && <Button size="sm" variant="ghost" onClick={() => set({ date: '' })}>Today</Button>}
          </div>
        </Field>
      </div>

      {p && !vendors.length && (
        <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center mb-4">
          No party ledger in this company is mapped to a marketplace yet.{' '}
          {can(PERM.MATCHING_VIEW) ? <>Map them on <Link to="/matching/parties" className="text-brand hover:underline">Matching → Party ledgers</Link>.</> : 'Ask an Accountant or Admin to map them on Matching → Party ledgers.'}
        </p>
      )}

      {!pick.ledger_guid && vendors.length > 0 && <Attention rows={p?.attention} total={p?.attention_total} onOpen={open} />}

      {pick.ledger_guid && dayLoad.loading && !day && <ReportTable loading head={['Loading the day…']} />}

      {pick.ledger_guid && !dayLoad.loading && !day && (
        <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">
          This party couldn’t be opened. <button type="button" className="text-brand hover:underline" onClick={() => set({ ledger_guid: '' })}>Choose another</button>.
        </p>
      )}

      {day && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{day.party.name}</h2>
            {day.party.vendor && <Badge color="brand">{day.party.vendor}</Badge>}
            {day.party.suggested && <Badge color="amber">suggested — confirm on Party ledgers</Badge>}
            <span className="text-sm text-gray-500">{day.party.company} · {formatDay(day.date)}</span>
            <span className="text-xs text-gray-400 ml-auto">Tally figures as of {day.as_of ? formatDateTime(day.as_of) : 'the last sync'}</span>
          </div>

          <div role="status" className={`rounded-xl border px-4 py-3 mb-4 ${BANNER[status.color]}`}>
            <p className="font-semibold">{status.label}</p>
            <p className="text-sm">{status.detail}</p>
          </div>

          <Summary day={day} />

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Entered in RAMS</h3>
            {canEnter && <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Add an entry</Button>}
          </div>
          <ReportTable
            head={['Type', 'No / reference', { label: 'Amount', right: true }, 'In Tally?', ...(canEnter ? [''] : [])]}
            empty={!day.entries.length && <p className="text-center text-gray-400 py-6 text-sm">Nothing entered for this day yet.{canEnter ? ' Click “Add an entry”.' : ''}</p>}
          >
            {day.entries.map((e) => {
              const s = entryStatus(e);
              return (
                <tr key={e.id} className="border-b border-gray-100 align-top">
                  <td className={`${td} whitespace-nowrap`}>{KIND[e.kind]?.label || e.kind}</td>
                  <td className={td}>
                    <span className="font-medium">{e.number || e.reference || <span className="text-gray-400">—</span>}</span>
                    {e.number && e.reference && <p className="text-xs text-gray-500">{e.reference}</p>}
                    {e.note && <p className="text-xs text-gray-500">{e.note}</p>}
                  </td>
                  <td className={num}>{signed(e.effect_paise)}</td>
                  <td className={td}>
                    <Badge color={s.color}>{s.label}</Badge>
                    {s.detail && <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>}
                  </td>
                  {canEnter && (
                    <td className={`${td} whitespace-nowrap text-right`}>
                      <button type="button" aria-label={`Change ${e.number || 'entry'}`} onClick={() => setEditing(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={14} /></button>
                      <button type="button" aria-label={`Remove ${e.number || 'entry'}`} onClick={() => setRemoving(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Trash2 size={14} /></button>
                      <HistoryButton entityType="ledger_entries" entityId={e.id} title={`History — ${KIND[e.kind]?.label} ${e.number || ''}`} />
                    </td>
                  )}
                </tr>
              );
            })}
          </ReportTable>

          {day.tally_only.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-2">In Tally, not entered here</h3>
              <ReportTable head={['Type', 'No', { label: 'Amount', right: true }, 'Status']}>
                {day.tally_only.map((v) => {
                  const s = tallyOnlyStatus(v);
                  return (
                    <tr key={v.guid} className="border-b border-gray-100 align-top">
                      <td className={`${td} whitespace-nowrap`}>{v.voucher_type}</td>
                      <td className={td}>{v.number || <span className="text-gray-400">—</span>}</td>
                      <td className={num}>{signed(v.effect_paise)}</td>
                      <td className={td}>
                        <Badge color={s.color}>{s.label}</Badge>
                        {s.detail && <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>}
                      </td>
                    </tr>
                  );
                })}
              </ReportTable>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-gray-500">
            <p>+ adds to what the party owes, − takes it off. Dr: the party owes us. Cr: we owe the party.</p>
            {can(PERM.LEDGERS_SETTINGS) && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> Ledger settings</Button>
            )}
          </div>
        </>
      )}

      {editing && day && (
        <EntryForm
          key={editing === 'new' ? 'new' : editing.id}
          party={day.party.name}
          companyId={day.party.company_id}
          ledgerGuid={day.party.guid}
          date={day.date}
          entry={editing === 'new' ? null : editing}
          minDate={day.sync_from}
          maxDate={day.today}
          onClose={() => setEditing(null)}
          onSaved={(d) => { setEditing(null); if (d !== date) set({ date: d }); reload(); }}
        />
      )}
      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="Remove this entry?"
        message={removing ? `${KIND[removing.kind]?.label} ${removing.number || removing.reference || ''} for ${formatRupees(removing.amount_paise)} on ${formatDay(removing.date)}. It stays in the audit log.` : ''}
        confirmLabel="Remove"
      />
      {settingsOpen && <LedgerSettings syncFrom={p?.sync_from} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); reload(); }} />}
    </AppShell>
  );
}
