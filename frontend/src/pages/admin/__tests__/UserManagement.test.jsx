import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserManagement from '../UserManagement';
import { renderWithProviders, ADMIN } from '../../../test/renderWithProviders';
import * as usersApi from '../../../api/users.api';
import * as audit from '../../../api/audit.api';

vi.mock('../../../api/users.api', () => ({
  listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), deactivateUser: vi.fn(), reactivateUser: vi.fn(), resetUserPassword: vi.fn(),
}));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const user = (over) => ({
  id: 3, name: 'Asha', username: 'asha', roles: ['Accountant'], is_first_login: false, is_active: true,
  created_at: '2026-10-04 06:00:00', updated_at: null, updated_by_name: null, ...over,
});

describe('Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersApi.listUsers.mockResolvedValue([
      user({ id: 1, name: 'Keshav', username: 'admin', roles: ['Admin'], updated_at: '2026-10-04 06:00:00', updated_by_name: 'Keshav' }),
      user({ updated_at: '2026-11-20 11:15:00', updated_by_name: 'Keshav' }),
      user({ id: 5, name: 'Ravi', username: 'ravi', roles: ['Viewer'] }),
    ]);
  });

  test('each user says who last changed their account, and when; that opens its history', async () => {
    renderWithProviders(<UserManagement />, { user: ADMIN });
    expect(await screen.findByText('asha')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last updated by' })).toBeInTheDocument();
    const asha = screen.getByText('asha').closest('tr');
    const cell = within(asha).getByRole('button', { name: /^History of Asha: last updated by Keshav/ });
    expect(cell).toHaveTextContent('20 Nov 2026, 04:45');
    expect(within(screen.getByText('ravi').closest('tr')).queryByRole('button', { name: /^History of/ })).not.toBeInTheDocument();

    await userEvent.setup().click(cell);
    expect(await screen.findByRole('dialog', { name: 'History — Asha' })).toBeInTheDocument();
    expect(audit.getEntityHistory).toHaveBeenCalledWith('user', 3);
  });
});
