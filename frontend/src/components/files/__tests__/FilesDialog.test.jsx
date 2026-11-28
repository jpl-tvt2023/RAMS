import {
  describe, test, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  render, screen, within, waitFor, fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import FilesDialog from '../FilesDialog';
import * as filesApi from '../../../api/files.api';
import * as pdf from '../../../utils/pdf';
import { saveBlob } from '../../../utils/saveBlob';

vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../../../utils/pdf', () => ({ openPdf: vi.fn(), PAGE_LIMIT: 50 }));
vi.mock('../../../utils/saveBlob', () => ({ saveBlob: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const at = '2026-11-10 08:00:00';
const FILES = [
  {
    id: 1, name: 'dn.pdf', kind: 'pdf', size: 120000, uploaded_by_name: 'Asha', uploaded_at: at,
  },
  {
    id: 2, name: 'photo.jpg', kind: 'image', size: 300000, uploaded_by_name: 'Asha', uploaded_at: at,
  },
  {
    id: 3, name: 'mail.eml', kind: 'email', size: 45000, uploaded_by_name: 'Keshav', uploaded_at: at,
  },
];
const TARGET = { companyId: 2, voucherGuid: 'g-cn-951' };

function open(props = {}) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<FilesDialog title="Credit Note 951" subtitle="ZEPTO (PUNE) · 02 Nov 2026" files={FILES} target={TARGET} canEdit onChanged={onChanged} onClose={onClose} {...props} />);
  return { onChanged, onClose, dialog: screen.getByRole('dialog', { name: 'Files — Credit Note 951' }) };
}

describe('a row’s files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    filesApi.fetchFile.mockResolvedValue(new Blob(['bytes']));
  });
  afterEach(() => { delete globalThis.createImageBitmap; });

  test('each file with its kind, size and who added it; an email offers Download, not View', async () => {
    const { dialog } = open();
    const list = within(dialog).getByRole('list', { name: 'Files' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('dn.pdf').closest('li')).toHaveTextContent('PDF · 117 KB · Asha');
    expect(within(dialog).getByRole('button', { name: 'View dn.pdf' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'View mail.eml' })).not.toBeInTheDocument();

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Download mail.eml' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith('mail.eml', expect.any(Blob)));
    expect(filesApi.fetchFile).toHaveBeenCalledWith(3, undefined);
  });

  test('a Purchase Reports record’s files are fetched and removed from its own store', async () => {
    filesApi.deleteFile.mockResolvedValue({ id: 8, removed: true });
    const mine = [{ ...FILES[2], id: 8, store: 'purchase' }];
    const { dialog } = open({ files: mine, target: { purchaseRecordId: 4 } });
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Download mail.eml' }));
    await waitFor(() => expect(filesApi.fetchFile).toHaveBeenCalledWith(8, 'purchase'));
    await user.click(within(dialog).getByRole('button', { name: 'Remove mail.eml' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Remove this file?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(filesApi.deleteFile).toHaveBeenCalledWith(8, 'purchase'));
  });

  test('View: a PDF’s pages are drawn; Next goes to the photo; an email only downloads; Esc closes', async () => {
    const doc = { pages: 2, render: vi.fn().mockResolvedValue({ width: 600, height: 800 }), close: vi.fn() };
    pdf.openPdf.mockResolvedValue(doc);
    const { dialog } = open();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'View dn.pdf' }));
    const viewer = screen.getByRole('dialog', { name: 'View dn.pdf' });
    expect(await within(viewer).findByLabelText('Page 1 of 2')).toBeInTheDocument();
    await waitFor(() => expect(doc.render).toHaveBeenCalledTimes(2));
    expect(within(viewer).getByText(/1 of 3/)).toBeInTheDocument();

    await user.click(within(viewer).getByRole('button', { name: 'Next file' }));
    const photo = await screen.findByRole('img', { name: 'photo.jpg' });
    expect(photo).toHaveAttribute('src', 'blob:photo');

    await user.click(screen.getByRole('button', { name: 'Next file' }));
    expect(screen.getByText('Emails open in your mail program')).toBeInTheDocument();
    expect(filesApi.fetchFile).not.toHaveBeenCalledWith(3); // fetched only when downloaded

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /^View / })).not.toBeInTheDocument();
    expect(doc.close).toHaveBeenCalled();
  });

  test('a PDF the browser can’t draw offers Download instead', async () => {
    pdf.openPdf.mockRejectedValue(new Error('old browser'));
    const { dialog } = open();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'View dn.pdf' }));
    expect(await screen.findByText('This PDF can’t be shown here')).toBeInTheDocument();
  });

  test('Choose files: each is sent to the row, then the row reloads', async () => {
    filesApi.uploadFile.mockImplementation(async ({ name }) => ({ id: 9, name }));
    const { dialog, onChanged } = open();
    const pdfFile = new File(['%PDF-1.4 a debit note'], 'FKIDN51803946.pdf', { type: 'application/pdf' });
    await userEvent.setup().upload(within(dialog).getByLabelText('Choose files to add'), pdfFile);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(filesApi.uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 2, voucherGuid: 'g-cn-951', name: 'FKIDN51803946.pdf', originalSize: pdfFile.size, gzip: expect.any(Boolean), blob: expect.any(Blob),
    }), expect.any(Function));
    expect(toast.success).toHaveBeenCalledWith('Added FKIDN51803946.pdf');
  });

  test('a file RAMS can’t take, or one the server refuses, says why and stays out', async () => {
    filesApi.uploadFile.mockRejectedValue({ response: { data: { message: 'This file is already on Credit Note 951' } } });
    const { dialog, onChanged } = open();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(within(dialog).getByLabelText('Choose files to add'), new File(['x'], 'IMG_0001.HEIC'));
    expect(await within(dialog).findByText(/Not added: .*HEIC photo/)).toBeInTheDocument();
    expect(filesApi.uploadFile).not.toHaveBeenCalled();
    await user.upload(within(dialog).getByLabelText('Choose files to add'), new File(['%PDF-1.4'], 'again.pdf', { type: 'application/pdf' }));
    expect(await within(dialog).findByText('Not added: This file is already on Credit Note 951')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss again.pdf' }));
    expect(within(dialog).queryByText(/already on/)).not.toBeInTheDocument();
  });

  test('Ctrl+V pastes a screenshot, named with the date and time', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 1200, height: 700, close: vi.fn() });
    filesApi.uploadFile.mockImplementation(async ({ name }) => ({ id: 10, name }));
    const { onChanged } = open();
    const shot = new File(['png bytes'], 'image.png', { type: 'image/png' });
    fireEvent.paste(document, { clipboardData: { items: [{ kind: 'file', getAsFile: () => shot }] } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(filesApi.uploadFile.mock.calls[0][0].name).toMatch(/^Screenshot \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.png$/);
  });

  test('Remove asks first, then reloads the row', async () => {
    filesApi.deleteFile.mockResolvedValue({ id: 1, removed: true });
    const { dialog, onChanged } = open();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: 'Remove dn.pdf' }));
    const confirm = screen.getByRole('dialog', { name: 'Remove this file?' });
    expect(confirm).toHaveTextContent('dn.pdf comes off Credit Note 951');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(filesApi.deleteFile).toHaveBeenCalledWith(1, undefined);
  });

  test('without “Attach files” it only shows them: no adding, no removing, and Ctrl+V does nothing', () => {
    const { dialog } = open({ canEdit: false });
    expect(within(dialog).queryByRole('button', { name: /Choose files/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    fireEvent.paste(document, { clipboardData: { items: [{ kind: 'file', getAsFile: () => new File(['x'], 'a.pdf') }] } });
    expect(filesApi.uploadFile).not.toHaveBeenCalled();
  });
});
