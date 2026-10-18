import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { ADMIN_ONLY } from '../../../utils/roles';
import { useAuth } from '../../../context/AuthContext';
import { HELD } from '../../../utils/releases';

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }));

// Renders the admin page behind ProtectedRoute, plus the pages it redirects to.
function renderAt(path, user) {
  useAuth.mockReturnValue({ user, loading: false });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/force-reset" element={<ProtectedRoute><p>set-password page</p></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={ADMIN_ONLY}><p>users page</p></ProtectedRoute>} />
        {HELD.length > 0 && <Route path={HELD[0]} element={<ProtectedRoute><p>held page</p></ProtectedRoute>} />}
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  test('no session goes to sign-in', () => {
    renderAt('/admin/users', null);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  test('a first or reset password still in force goes to set a password — and that page itself is reachable', () => {
    renderAt('/admin/users', { roles: ['Admin'], is_first_login: true });
    expect(screen.getByText('set-password page')).toBeInTheDocument();
  });

  test('a Viewer cannot reach an admin page', () => {
    renderAt('/admin/users', { roles: ['Viewer'], is_first_login: false });
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  test('an Owner can', () => {
    renderAt('/admin/users', { roles: ['Owner'], is_first_login: false });
    expect(screen.getByText('users page')).toBeInTheDocument();
  });

  test.runIf(HELD.length > 0)('a screen held for later delivery goes to the Dashboard, even for an Admin', () => {
    renderAt(HELD[0], { roles: ['Admin'], is_first_login: false });
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });
});
