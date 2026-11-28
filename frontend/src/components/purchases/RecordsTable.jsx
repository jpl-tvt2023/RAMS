import {
  CircleAlert, Eye, Paperclip, Undo2,
} from 'lucide-react';
import { ReportTable, td, num } from '../reports/ReportFrame';
import Button from '../ui/Button';
import ApprovalCell from './ApprovalCell';
import { LastUpdatedCell } from '../shared/LastUpdated';
import { HistoryButton } from '../shared/HistoryDrawer';
import { formatDate, formatDateTime } from '../../utils/formatters';
import {
  ROW_FILL, numText, deliveryRuns, notesOf, maySend, mayApprove, mayRecall, maySendBack,
} from '../../utils/purchaseText';

const TONE = { muted: 'text-gray-500', plain: 'text-gray-700', red: 'text-red-700 font-medium' };

/**
 * Purchase Reports' table: one row per ROMS line -- its bill, check, two
 * approvals and its Note (one short note per stage) -- with the lines of one
 * delivery together under one Incoming cell. Only an approved line (green)
 * and one sent back (red) are highlighted. The bill is reached through the
 * row's button (the user, 2026-11-29: no Files column): "View/Attach bill"
 * where this person may attach and send it, else "View bill", read-only.
 *
 * The tick column is there only when this person can act on a line on the
 * page -- send it for approval, approve it, or recall it; a delivery with
 * several such lines gets one tick for all.
 *
 * can: { check, purchase, accounts } -- what this person may do.
 * selected / onSelect(id, on) / onSelectMany(ids, on): the ticked lines.
 * onCheck(r): the bill popup. onApprove(r). onSendBack(r, step). onRecall(r).
 */
export default function RecordsTable({
  rows, loading, can, selected, onSelect, onSelectMany, onCheck, onApprove, onSendBack, onRecall, empty,
}) {
  const tickable = (r) => maySend(r, can) || mayApprove(r, can) || mayRecall(r, can);
  const selectable = rows.some(tickable);
  const head = [
    ...(selectable ? [{ label: '', className: 'w-10' }] : []),
    'Incoming', 'Date', 'Billing / Challan', 'PO', 'Article', { label: 'Rate', right: true }, { label: 'Qty', right: true }, 'UOM',
    'Bill check by', 'Purchase Head', 'Accountant Head', 'Note', 'Actions',
  ];
  return (
    <ReportTable head={head} loading={loading} empty={!loading && !rows.length ? empty : null}>
      {deliveryRuns(rows).map((run) => {
        const first = run.rows[0];
        const ticks = run.rows.filter(tickable).map((r) => r.id);
        const allTicked = ticks.length > 0 && ticks.every((id) => selected.has(id));
        return run.rows.map((r, i) => {
          const l = r.lines[0] || { key: 'none', removed: true };
          const lineFill = ROW_FILL[r.status] || '';
          const gone = l.removed ? 'line-through text-gray-400' : '';
          const last = i === run.rows.length - 1;
          const attach = maySend(r, can);
          const sendBackAs = (step) => (maySendBack(r, step, can) ? () => onSendBack(r, step) : undefined);
          return (
            <tr key={r.id} className={`${last ? 'border-b border-gray-200' : 'border-b border-gray-100'} ${lineFill} align-middle`}>
              {selectable && (
                <td className={td}>
                  {tickable(r) && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.label}`}
                      checked={selected.has(r.id)}
                      onChange={(e) => onSelect(r.id, e.target.checked)}
                      className="w-4 h-4 accent-brand align-middle"
                    />
                  )}
                </td>
              )}
              {i === 0 && (
                <td rowSpan={run.rows.length} className={`${td} whitespace-nowrap align-top bg-white`}>
                  {first.incoming
                    ? <span className="font-mono font-medium text-gray-900">{first.incoming}</span>
                    : first.no_incoming
                      ? <span className="inline-flex items-center gap-1 text-gray-600" title="ROMS has no Incoming No on this receipt. Add it in ROMS and RAMS lists it with its delivery."><CircleAlert size={12} aria-hidden="true" />No Incoming No in ROMS</span>
                      : <span className="text-gray-400">—</span>}
                  <span className="block text-xs text-gray-500">{first.kind === 'challan' ? first.party : first.vendor}</span>
                  {run.rows.length > 1 && <span className="block text-xs text-gray-400">{run.rows.length} lines</span>}
                  {ticks.length > 1 && (
                    <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Select all ${ticks.length} lines of ${first.delivery?.label || first.label}`}
                        checked={allTicked}
                        onChange={(e) => onSelectMany(ticks, e.target.checked)}
                        className="w-3.5 h-3.5 accent-brand"
                      />
                      All {ticks.length}
                    </label>
                  )}
                </td>
              )}
              <td className={`${td} whitespace-nowrap ${gone}`}>{l.date ? formatDate(l.date) : '—'}</td>
              <td className={`${td} ${gone}`}>
                <span className="font-mono">{l.billing || '—'}</span>
                {l.from_stage && <span className="block text-xs text-gray-500 whitespace-nowrap">{l.from_stage} → {l.to_stage}</span>}
              </td>
              <td className={`${td} ${gone}`}>{l.po || '—'}</td>
              <td className={`${td} min-w-48 ${gone}`}>{l.article || '—'}</td>
              <td className={`${num} ${gone}`}>{numText(l.rate)}</td>
              <td className={`${num} ${gone}`}>{numText(l.qty)}</td>
              <td className={`${td} ${gone}`}>{l.uom || '—'}</td>
              <td className={td}>
                <LastUpdatedCell
                  name={r.check?.name}
                  at={r.check?.at}
                  entityType="purchase_records"
                  entityId={r.id}
                  what={r.label}
                  title={`History — ${r.label}`}
                  description={r.check?.note ? `Note: ${r.check.note}` : 'Bill check — see every change'}
                />
              </td>
              <td className={td}><ApprovalCell record={r} step="purchase" onSendBack={sendBackAs('purchase')} /></td>
              <td className={td}><ApprovalCell record={r} step="accounts" onSendBack={sendBackAs('accounts')} /></td>
              <td className={`${td} min-w-56 max-w-xs`}>
                <ul className="space-y-0.5" aria-label="Note">
                  {notesOf(r).map((n) => {
                    const Icon = n.icon;
                    return (
                      <li key={n.key} className={`flex items-start gap-1 text-xs ${TONE[n.tone]}`}>
                        <Icon size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          {n.text}
                          {n.at && <span className="block text-gray-500">{formatDateTime(n.at)}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <div className="flex items-center gap-1">
                  {attach ? (
                    <Button size="sm" onClick={() => onCheck(r)} aria-label={`View/Attach bill: ${r.label}`}>
                      <Paperclip size={14} aria-hidden="true" /> View/Attach bill
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onCheck(r)} aria-label={`View bill: ${r.label}`}>
                      <Eye size={14} aria-hidden="true" /> View bill
                    </Button>
                  )}
                  {mayApprove(r, can) && (
                    <>
                      <Button size="sm" onClick={() => onApprove(r)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => onSendBack(r)}>Send back</Button>
                    </>
                  )}
                  {mayRecall(r, can) && (
                    <Button size="sm" variant="outline" onClick={() => onRecall(r)} aria-label={`Recall: ${r.label}`}>
                      <Undo2 size={14} aria-hidden="true" /> Recall
                    </Button>
                  )}
                  <HistoryButton entityType="purchase_records" entityId={r.id} title={`History — ${r.label}`} />
                </div>
              </td>
            </tr>
          );
        });
      })}
    </ReportTable>
  );
}
