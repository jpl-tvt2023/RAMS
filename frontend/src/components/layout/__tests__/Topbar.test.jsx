import { describe, test, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Topbar from '../Topbar';
import { renderWithProviders, VIEWER } from '../../../test/renderWithProviders';

// The top bar: Bills Receivable and Party Statements under Tally Reports, each by its
// permission, and Purchase Reports greyed as coming soon.
describe('Topbar', () => {
  test('Tally Reports holds Bills Receivable and Party Statements', async () => {
    renderWithProviders(<Topbar />, { user: VIEWER });
    const user = userEvent.setup();
    expect(screen.queryByRole('link', { name: /Party Statements|Ledgers/ })).not.toBeInTheDocument(); // only inside the menu
    await user.click(screen.getByRole('button', { name: 'Tally Reports' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.getAttribute('href'))).toEqual(['/reports/bills-receivable', '/reports/party-statements']);
    expect(within(menu).getAllByRole('menuitem').map((m) => m.querySelector('span span').textContent)).toEqual(['Bills Receivable', 'Party Statements']);
  });

  test('each report shows only with its permission', async () => {
    renderWithProviders(<Topbar />, { user: { ...VIEWER, permissions: VIEWER.permissions.filter((k) => k !== 'statements.view') } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tally Reports' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.getAttribute('href'))).toEqual(['/reports/bills-receivable']);
  });

  test('Purchase Reports is greyed, says Coming soon, and is not a link', () => {
    renderWithProviders(<Topbar />, { user: VIEWER });
    const soon = screen.getByTitle('Purchase Reports: coming soon');
    expect(soon).toHaveAttribute('aria-disabled', 'true');
    expect(soon).toHaveTextContent('Purchase ReportsComing soon');
    expect(screen.queryByRole('link', { name: /Purchase Reports/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Purchase Reports/ })).not.toBeInTheDocument();
  });

  test('the mobile menu shows the same', async () => {
    renderWithProviders(<Topbar />, { user: VIEWER });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getAllByTitle('Purchase Reports: coming soon')).toHaveLength(2);
    expect(screen.getAllByText('Tally Reports').length).toBeGreaterThan(1);
    expect(screen.getAllByRole('link', { name: 'Party Statements' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Bills Receivable' })).toHaveLength(1);
  });
});
