import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Paperclip } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import HelpLink from '../../components/shared/HelpLink';
import { ReportTable, td, num } from '../../components/reports/ReportFrame';
import FileViewer from '../../components/files/FileViewer';
import { KIND_ICON } from '../../components/files/icons';
import { getFileUsage } from '../../api/files.api';
import { KINDS, sizeText } from '../../utils/files';
import { openLedgersAt } from '../../utils/ledgerLinks';
import { formatDay, formatDateTime } from '../../utils/formatters';

// Admin -> File storage (Admin and Owner): how much space the files on
// Ledgers take in RAMS's database, how much shrinking photos, compressing PDFs
// and emails, and storing a file once saved, and the biggest files -- each
// can be viewed, or opened on Ledgers where it is.

function Tile({ label, value, detail }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value}</p>
      {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
    </div>
  );
}

// "MH · Credit Note 951 · ZEPTO (PUNE) · 20 Aug 2026" -- every file is on a
// Tally voucher.
const whereOf = (f) => {
  const o = f.on || {};
  const row = `${o.voucher_type || 'Tally voucher'} ${o.number || ''}`;
  return [f.company, row.trim(), o.party, o.date ? formatDay(o.date) : null].filter(Boolean).join(' · ');
};

export default function FileStorage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [viewing, setViewing] = useState(null); // index into data.biggest
  useEffect(() => {
    getFileUsage().then(setData).catch(() => toast.error('Failed to load the file storage figures'));
  }, []);

  const openOnLedgers = (f) => {
    openLedgersAt({
      companyId: f.company_id, vendor: f.on.vendor, guid: f.on.party_guid, date: f.on.date, syncFrom: data.sync_from,
    });
    navigate('/ledgers');
  };

  const savedShare = data?.picked_bytes ? Math.round((data.saved_bytes / data.picked_bytes) * 100) : 0;

  return (
    <AppShell>
      <div className="mb-6 max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">File storage</h1>
          <HelpLink section="file-storage" />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          The PDFs, photos and emails attached on Ledgers are kept in RAMS’s database. Photos are made smaller, PDFs and emails are compressed without losing anything, and a file attached to several rows is kept once.
        </p>
      </div>

      {!data ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Tile label="Files" value={data.files.toLocaleString('en-IN')} detail={`${data.stored_files.toLocaleString('en-IN')} kept, as some are on more than one row`} />
            <Tile label="Space used" value={sizeText(data.stored_bytes)} detail="In RAMS’s database" />
            <Tile label="Space saved" value={sizeText(data.saved_bytes)} detail={data.picked_bytes ? `${savedShare}% of ${sizeText(data.picked_bytes)} as picked` : 'Nothing attached yet'} />
            <Tile label="Largest file" value={sizeText(data.max_upload_bytes)} detail="Each, after RAMS compresses it" />
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mb-2">By kind</h2>
          <div className="mb-6 max-w-2xl">
            <ReportTable head={['Kind', { label: 'Files', right: true }, { label: 'As picked', right: true }, { label: 'Kept', right: true }]}>
              {data.kinds.map((k) => {
                const Icon = KIND_ICON[k.kind] || Paperclip;
                return (
                  <tr key={k.kind} className="border-b border-gray-100">
                    <td className={td}><span className="inline-flex items-center gap-2"><Icon size={14} className="text-gray-500" aria-hidden="true" />{KINDS[k.kind]?.label || k.kind}</span></td>
                    <td className={num}>{k.files.toLocaleString('en-IN')}</td>
                    <td className={num}>{sizeText(k.picked_bytes)}</td>
                    <td className={num}>{sizeText(k.stored_bytes)}</td>
                  </tr>
                );
              })}
            </ReportTable>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mb-2">The biggest files</h2>
          <ReportTable
            head={['File', 'Where', 'Added', { label: 'Kept', right: true }, '']}
            empty={!data.biggest.length && <p className="text-center text-gray-400 py-8 text-sm">No file has been attached yet.</p>}
          >
            {data.biggest.map((f, i) => {
              const Icon = KIND_ICON[f.kind] || Paperclip;
              const canOpen = Boolean(f.on?.party_guid && f.on?.vendor);
              return (
                <tr key={f.id} className="border-b border-gray-100 align-top">
                  <td className={`${td} max-w-[18rem]`}>
                    <span className="inline-flex items-start gap-2 min-w-0">
                      <Icon size={14} className="text-gray-500 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-medium break-words">{f.name}</span>
                        <span className="block text-xs text-gray-500">{KINDS[f.kind]?.label || 'File'} · {sizeText(f.size)} as downloaded</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${td} text-gray-700`}>{whereOf(f)}</td>
                  <td className={`${td} text-xs text-gray-500 whitespace-nowrap`}>{f.uploaded_by_name || 'someone'}<br />{formatDateTime(f.uploaded_at)}</td>
                  <td className={num}>{sizeText(f.stored_size)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <button type="button" onClick={() => setViewing(i)} aria-label={`View ${f.name}`} className="text-sm text-brand hover:underline">{f.kind === 'email' ? 'Download' : 'View'}</button>
                    {canOpen && (
                      <button type="button" onClick={() => openOnLedgers(f)} aria-label={`Open ${f.name} on Ledgers`} className="ml-3 text-sm text-brand hover:underline">Open on Ledgers</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </ReportTable>
          <p className="text-xs text-gray-500 mt-3">
            Your database plan’s storage limit is on the Turso dashboard; RAMS can’t read it from inside. To free space, remove files nobody needs on Ledgers.
            A file goes once no row uses it.
          </p>
        </>
      )}

      {viewing != null && data && <FileViewer files={data.biggest} start={viewing} onClose={() => setViewing(null)} />}
    </AppShell>
  );
}
