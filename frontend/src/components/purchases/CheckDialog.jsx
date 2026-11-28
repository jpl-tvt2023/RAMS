import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import FilesPanel from '../files/FilesPanel';
import { getPurchaseRecord } from '../../api/purchases.api';
import {
  numText, statusOf, WITH_CHECKER, HEAD_OF,
} from '../../utils/purchaseText';
import {
  TABLE_BOX, IN_POPUP, STICKY_HEAD, HEAD_CELL,
} from '../ui/tableBox';

const NOTE_MAX = 500;
const th = `px-3 py-2 text-left font-semibold whitespace-nowrap ${HEAD_CELL}`;

/**
 * The bill check -- the one window for a line's bill (the user, 2026-11-28:
 * the bill check and "add files" were the same job). It shows the line's
 * delivery: every line under the same Incoming No (or challan), the opened one
 * ticked. Most deliveries come on one bill, so the checker may tick the
 * delivery's other lines still waiting for a check: an upload goes on every
 * ticked line (stored once), a removal takes the file off them, and Save
 * saves the bill check on each -- each line keeping its own files, history
 * and approvals. Saving sends them to the Purchase Head and locks their files.
 *
 * record: the list row it opened from. canEdit: purchases.check.
 * onChanged: reload the page's list (files added or removed). onSave(ids, note).
 */
export default function CheckDialog({
  record, canEdit, onChanged, onSave, onClose, saving,
}) {
  const [note, setNote] = useState('');
  const [full, setFull] = useState(null); // the record with delivery_lines, once loaded
  const [ticked, setTicked] = useState(() => new Set([record.id]));
  const r = full || record;
  const lines = full?.delivery_lines || [{
    id: record.id, status: record.status, files: record.files.length, ...(record.lines[0] || {}),
  }];
  const open = (l) => WITH_CHECKER.includes(l.status);
  const others = lines.filter((l) => l.id !== record.id && open(l));
  const also = [...ticked].filter((id) => id !== record.id);
  const editable = canEdit && WITH_CHECKER.includes(r.status);

  const load = async () => {
    try {
      setFull(await getPurchaseRecord(record.id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'This delivery’s other lines could not be loaded');
    }
  };
  useEffect(() => {
    let alive = true;
    getPurchaseRecord(record.id)
      .then((d) => { if (alive) setFull(d); })
      .catch((err) => { if (alive) toast.error(err.response?.data?.message || 'This delivery’s other lines could not be loaded'); });
    return () => { alive = false; };
  }, [record.id]);

  const tick = (id, on) => setTicked((s) => {
    const n = new Set(s);
    if (on) n.add(id); else if (id !== record.id) n.delete(id);
    return n;
  });
  const allTicked = others.length > 0 && others.every((l) => ticked.has(l.id));
  const changedFiles = () => { load(); if (onChanged) onChanged(); };

  return (
    <Modal isOpen onClose={onClose} title={`Bill check — ${r.delivery?.label || r.label}`} size="xl">
      {r.status === 'sent_back' && r.sent_back && (
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
          Sent back by the {HEAD_OF[r.sent_back.step] || 'head'} ({r.sent_back.name || 'someone'}): {r.sent_back.reason}
        </p>
      )}
      {r.status === 'changed' && (
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-3">
          ROMS changed this line after its last bill check, so its approvals were cleared. Check it against the bill again.
        </p>
      )}

      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        {lines.length > 1 ? `The delivery’s ${lines.length} lines` : 'The line'}
      </h3>
      {others.length > 0 && (
        <p className="text-xs text-gray-500 mb-2">One bill for several lines? Tick them: the file and the bill check go on every ticked line, and each is still approved on its own.</p>
      )}
      <div className={`border border-gray-200 rounded-lg ${TABLE_BOX} ${IN_POPUP}`}>
        <table className="w-full text-sm">
          <thead className={STICKY_HEAD}>
            <tr className="text-gray-600">
              <th className={`${th} w-10`}>
                {others.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label="Tick every line waiting for a check"
                    checked={allTicked}
                    onChange={(e) => others.forEach((l) => tick(l.id, e.target.checked))}
                    className="w-4 h-4 accent-brand"
                  />
                )}
              </th>
              {['Billing / Challan', 'PO', 'Article', 'Rate', 'Qty', 'UOM', 'Files', 'Status'].map((h) => (
                <th key={h} className={`${th} ${['Rate', 'Qty'].includes(h) ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const mine = l.id === record.id;
              return (
                <tr key={l.id} className={`border-t border-gray-100 ${mine ? 'bg-brand-surface/60 font-medium' : ''} ${open(l) ? '' : 'text-gray-400'}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={mine ? 'This line (always included)' : `Include ${l.article || 'this line'}${l.qty != null ? ` (${numText(l.qty)} ${l.uom || ''})` : ''}`}
                      checked={ticked.has(l.id)}
                      disabled={mine || !open(l) || !editable}
                      onChange={(e) => tick(l.id, e.target.checked)}
                      className="w-4 h-4 accent-brand"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono">{l.billing || '—'}</td>
                  <td className="px-3 py-2">{l.po || '—'}</td>
                  <td className="px-3 py-2">{l.article || '—'}{mine && <span className="ml-1 text-xs text-brand">(this line)</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numText(l.rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numText(l.qty)}</td>
                  <td className="px-3 py-2">{l.uom || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.files ? `${l.files} ${l.files === 1 ? 'file' : 'files'}` : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{statusOf(l.status).label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-1">Bill or challan</h3>
      <p className="text-xs text-gray-500 mb-2">
        {also.length
          ? `Files on this line. An upload goes on all ${also.length + 1} ticked lines; removing a file takes it off them too.`
          : 'Files on this line.'}
      </p>
      <FilesPanel
        what={r.label}
        files={r.files}
        target={editable ? { purchaseRecordId: record.id, also } : undefined}
        canEdit={editable}
        onChanged={changedFiles}
        dropHint="Drop the bill here (PDF, photo or email), or"
      />

      <label htmlFor="check-note" className="block text-sm font-medium text-gray-700 mt-4 mb-1">Note (optional)</label>
      <textarea
        id="check-note"
        rows={2}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: bill matches the PO, or what was corrected"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <p className="text-xs text-gray-500 mt-2">
        Saving sends {ticked.size === 1 ? 'this line' : `the ${ticked.size} ticked lines`} to the Purchase Head. The files are locked from then on, so the heads approve what you checked.
      </p>
      <div className="flex gap-3 justify-end mt-4">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        {editable && (
          <Button onClick={() => onSave([...ticked], note.trim())} loading={saving}>
            {ticked.size === 1 ? 'Save bill check' : `Save bill check on ${ticked.size} lines`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
