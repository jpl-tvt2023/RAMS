import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';

const LONG = 'History — Incoming STCMKC-29 (Shakuntala Textile) — Handkerchief - Bundle Fabric - 75" Light Medium';

describe('Modal', () => {
  test('opened from a table cell that never wraps, it is drawn at the end of the page, not inside the cell', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <td className="whitespace-nowrap" data-testid="cell">
              <Modal isOpen onClose={() => {}} title={LONG}>Body</Modal>
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const dialog = screen.getByRole('dialog', { name: LONG });
    expect(screen.getByTestId('cell')).toBeEmptyDOMElement();
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    // The title may wrap; the close button keeps its size and corner.
    expect(screen.getByRole('heading', { name: LONG })).toHaveClass('min-w-0', 'break-words');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('shrink-0');
    expect(dialog.parentElement).toHaveClass('whitespace-normal');
  });

  test('closes from the button and the backdrop; nothing is drawn when closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Modal isOpen onClose={onClose} title="Popup">Body</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('dialog').previousSibling);
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Modal isOpen={false} onClose={onClose} title="Popup">Body</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
