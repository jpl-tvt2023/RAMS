import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import FileStorage from '../FileStorage';
import { renderWithProviders, ADMIN } from '../../../test/renderWithProviders';
import * as filesApi from '../../../api/files.api';

vi.mock('../../../api/files.api', () => ({ getFileUsage: vi.fn(), fetchFile: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const USAGE = {
  files: 12,
  stored_files: 10,
  picked_bytes: 40 * 1048576,
  stored_bytes: 6 * 1048576,
  saved_bytes: 34 * 1048576,
  max_upload_bytes: 4 * 1048576,
  sync_from: '2026-06-08',
  kinds: [
    {
      kind: 'pdf', files: 5, picked_bytes: 3 * 1048576, stored_bytes: 2 * 1048576,
    },
    {
      kind: 'image', files: 4, picked_bytes: 36 * 1048576, stored_bytes: 3 * 1048576,
    },
    {
      kind: 'email', files: 3, picked_bytes: 1048576, stored_bytes: 1048576,
    },
  ],
  biggest: [
    {
      id: 7, name: 'DN scan.jpg', kind: 'image', size: 900000, stored_size: 900000, uploaded_by_name: 'Asha', uploaded_at: '2026-11-02 09:00:00', company_id: 2, company: 'MH',
      on: {
        type: 'voucher', voucher_type: 'Credit Note', number: '951', date: '2026-05-20', party: 'ZEPTO (PUNE)', party_guid: 'Z1', vendor: 'Zepto',
      },
    },
    {
      id: 8, name: 'mail.eml', kind: 'email', size: 400000, stored_size: 120000, uploaded_by_name: 'Keshav', uploaded_at: '2026-11-03 09:00:00', company_id: 2, company: 'MH',
      on: {
        type: 'voucher', voucher_type: 'Sales', number: '201/RM/26-27', date: '2026-11-01', party: 'Unmapped party', party_guid: 'U1', vendor: null,
      },
    },
  ],
};

describe('File storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    filesApi.getFileUsage.mockResolvedValue(USAGE);
  });

  test('the space used and saved, by kind, and the biggest files with where they are', async () => {
    renderWithProviders(<FileStorage />, { user: ADMIN });
    expect(await screen.findByText('6.0 MB')).toBeInTheDocument();
    expect(screen.getByText('34 MB')).toBeInTheDocument();
    expect(screen.getByText('85% of 40 MB as picked')).toBeInTheDocument();
    expect(screen.getByText('10 kept, as some are on more than one row')).toBeInTheDocument();
    const scan = screen.getByText('DN scan.jpg').closest('tr');
    expect(scan).toHaveTextContent('MH · Credit Note 951 · ZEPTO (PUNE) · 20 May 2026');
    // An email downloads rather than opens; a party with no marketplace can't open on Ledgers.
    const mail = screen.getByText('mail.eml').closest('tr');
    expect(within(mail).getByRole('button', { name: 'View mail.eml' })).toHaveTextContent('Download');
    expect(within(mail).queryByRole('button', { name: /on Ledgers/ })).not.toBeInTheDocument();
  });

  test('Open on Ledgers goes to the party, from the file’s date (or RAMS’s start)', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/files" element={<FileStorage />} />
        <Route path="/ledgers" element={<p>Ledgers page</p>} />
      </Routes>,
      { user: ADMIN, route: '/admin/files' },
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Open DN scan.jpg on Ledgers' }));
    expect(screen.getByText('Ledgers page')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('rams:ledgers.filters:v1'))).toMatchObject({
      company: '2', vendor: 'Zepto', states: 'all', parties: ['2:Z1'], from: '2026-06-08', to: '', open: '2:Z1', nofile: false,
    });
  });
});
