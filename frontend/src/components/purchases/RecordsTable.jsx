import { CircleAlert, RefreshCw, Upload } from 'lucide-react';
import { ReportTable, td, num } from '../reports/ReportFrame';
import FilesCell from '../files/FilesCell';
import Button from '../ui/Button';
import ApprovalCell from './ApprovalCell';
import { LastUpdatedCell } from '../shared/LastUpdated';
import { HistoryButton } from '../shared/HistoryDrawer';
import { formatDate, formatDateTime } from '../../utils/formatters';
import {
  statusOf, statusDetail, ROW_FILL, STATUS_TEXT, WITH_CHECKER, stepOf, numText, deliveryRuns,
} from '../../utils/purchaseText';

/**
 * Purchase Reports' table: one row per ROMS line -- its own files, bill check,
 * two approvals and status -- with the lines of one delivery together under
 * one Incoming cell. Only an approved line (green) and one sent back (red) are
 * highlighted. The tick column is there only when this person can approve a
 * line on the page; a delivery with several such lines gets one tick for all.
 *
 * can: { check, purchase, accounts } -- what this person may do.
 * selected / onSelect(id, on) / onSelectMany(ids, on): the lines ticked for "Approve selected".
 */
export default function RecordsTable({
  rows, loading, can, selected, onSelect, onSelectMany, onFiles, onCheck, onApprove, onSendBack, empty,
}) {
  const mayApprove = (r) => {
    const step = stepOf(r.status);
    return (step === 'purchase' && can.purchase) || (step === 'accounts' && can.accounts);
  };
  const selectable = rows.some(mayApprove);
  const head = [
    ...(selectable ? [{ label: '', className: 'w-10' }] : []),
    'Incoming', 'Date', 'Billing / Challan', 'PO', 'Article', { label: 'Rate', right: true }, { label: 'Qty', right: true }, 'UOM',
    'Files', 'Bill check by', 'Purchase Head', 'Accountant Head', 'Status', 'Actions',
  ];
  return (
    <ReportTable head={head} loading={loading} empty={!loading && !rows.length ? empty : null}>
      {deliveryRuns(rows).map((run) => {
        const first = run.rows[0];
        const ticks = run.rows.filter(mayApprove).map((r) => r.id);
        const allTicked = ticks.length > 0 && ticks.every((id) => selected.has(id));
        return run.rows.map((r, i) => {
          const l = r.lines[0] || { key: 'none', removed: true };
          const status = statusOf(r.status);
          const Icon = status.icon;
          const lineFill = ROW_FILL[r.status] || '';
          const gone = l.removed ? 'line-through text-gray-400' : '';
          const last = i === run.rows.length - 1;
          return (
            <tr key={r.id} className={`${last ? 'border-b border-gray-200' : 'border-b border-gray-100'} ${lineFill} align-middle`}>
              {selectable && (
                <td className={td}>
                  {mayApprove(r) && (
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
                <FilesCell files={r.files} what={r.label} canFiles={false} onOpen={() => onFiles(r)} />
              </td>
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
              <td className={td}><ApprovalCell record={r} step="purchase" /></td>
              <td className={td}><ApprovalCell record={r} step="accounts" /></td>
              <td className={`${td} max-w-xs`}>
                <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${STATUS_TEXT[r.status] || 'text-gray-700'}`}>
                  <Icon size={14} aria-hidden="true" />{status.label}
                </span>
                {statusDetail(r).map((t) => (
                  <span key={t} className={`block text-xs ${STATUS_TEXT[r.status] || 'text-gray-500'}`}>{t}</span>
                ))}
                {r.status === 'changed' && r.changed?.changes?.length > 0 && (
                  <ul className="mt-0.5 text-xs text-gray-500 space-y-0.5" aria-label="What ROMS changed">
                    {r.changed.changes.slice(0, 3).map((c) => (
                      <li key={`${c.field}-${c.new}`}>{c.field}: {c.old ?? '—'} → {c.new ?? '—'}</li>
                    ))}
                    {r.changed.changes.length > 3 && <li>and {r.changed.changes.length - 3} more (see the history)</li>}
                  </ul>
                )}
                {r.status === 'changed' && r.changed?.at && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5"><RefreshCw size={11} aria-hidden="true" />ROMS changed it {formatDateTime(r.changed.at)}</span>
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <div className="flex items-center gap-1">
                  {can.check && WITH_CHECKER.includes(r.status) && (
                    <Button size="sm" onClick={() => onCheck(r)} aria-label={`${r.status === 'to_check' ? 'Upload bill & check' : 'Check again'}: ${r.label}`}>
                      <Upload size={14} aria-hidden="true" /> {r.status === 'to_check' ? 'Upload bill & check' : 'Check again'}
                    </Button>
                  )}
                  {mayApprove(r) && (
                    <>
                      <Button size="sm" onClick={() => onApprove(r)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => onSendBack(r)}>Send back</Button>
                    </>
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
